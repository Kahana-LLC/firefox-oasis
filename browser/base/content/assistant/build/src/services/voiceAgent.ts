import type { VoiceUiDelivery } from "../../../shared/contracts.js";
import { transcribeAudio, textToSpeech } from "../proxyClient.js";
import type { AssistantWindowLike } from "../types/runtime.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { advanceVadSpeechDebounce } from "../utils/voiceVadDebounce.js";
import { shouldDiscardAutoTranscript } from "../utils/voiceUtteranceGuards.js";

const TTS_STOP_EVENT = "oasis-tts-stop";
const MAX_TTS_CHARS = 2000;
const TARGET_TRANSCRIBE_SAMPLE_RATE = 16000;
const PRE_ROLL_MS = 1200;
const MAX_CAPTURE_HISTORY_MS = 12000;
const MANUAL_FLUSH_LOOKBACK_MS = 2800;
const VAD_THRESHOLD_MULTIPLIER = 2.0;
const VAD_MIN_THRESHOLD = 0.01;
const VAD_MAX_THRESHOLD = 0.045;
const VAD_SILENCE_MS = 1250;
const VAD_SPEECH_ON_FRAMES = 2;
const VAD_MIN_UTTERANCE_MS = 240;
const RECORDER_SLICE_MS = 160;
const PRECISE_START_RMS_THRESHOLD = 0.014;
const PRECISE_START_FRAMES = 4;
const ECHO_GUARD_MS_AFTER_TTS = 700;
const ECHO_GUARD_MS_AFTER_TTS_INTERRUPT = 450;
const ECHO_GUARD_MS_AFTER_TEXT_REPLY = 180;
const AUTO_MIN_UTTERANCE_BYTES_PRECISE = 800;
const MANUAL_STOP_MIN_UTTERANCE_MS = 120;
const MANUAL_STOP_MIN_UTTERANCE_BYTES = 120;
const MIN_UTTERANCE_BYTES = 400;
const VAD_SPEECH_DEBOUNCE_FRAMES = 3;

export type VoiceAgentState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export type VoiceAgentListener = (event: VoiceAgentEvent) => void;

export type VoiceAgentListeningSource = "user" | "continuous" | "handsfree";

export type VoiceAgentEvent =
  | {
      type: "state";
      state: VoiceAgentState;
      listeningSource?: VoiceAgentListeningSource;
    }
  | { type: "userTranscript"; text: string }
  | { type: "error"; message: string }
  | { type: "turn_done" }
  | { type: "vad"; userSpeaking: boolean }
  | { type: "audio_level"; mic: number; tts: number }
  | { type: "listening_phase"; phase: "echo_guard" | "capturing" }
  | { type: "assistant_reply_text"; text: string };

type RunAssistantFn = (
  prompt: string,
  onChunk: (chunk: string) => void,
  inputType: "text" | "voice",
  messageId?: string,
  voiceDelivery?: VoiceUiDelivery
) => Promise<string>;

type RecorderChunk = {
  blob: Blob;
  timestampMs: number;
};

type PcmChunk = {
  samples: Float32Array;
  startMs: number;
  endMs: number;
  sampleRate: number;
};

type PreparedUtterance = {
  blob: Blob;
  captureMeta: {
    preprocessed: boolean;
    mimeType: string;
    durationMs?: number;
    rms?: number;
    sampleRateHz?: number;
    channels?: number;
  };
};

type UtterancePcm = {
  samples: Float32Array;
  sampleRate: number;
};

function eventBlob(event: Event): Blob | null {
  const data = (event as { data?: unknown }).data;
  return data instanceof Blob ? data : null;
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function voicePreview(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "(empty)";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export type VoiceCaptureMode = "continuous" | "precise";

export const VOICE_CAPTURE_MODE_STORAGE_KEY = "oasis.voice.captureMode";
export const VOICE_SPOKEN_REPLIES_STORAGE_KEY = "oasis.voice.orbSpokenReplies";

function readStoredCaptureMode(): VoiceCaptureMode {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return "continuous";
    const v = ls.getItem(VOICE_CAPTURE_MODE_STORAGE_KEY);
    if (v === "precise") return "precise";
  } catch {
    // ignore
  }
  return "continuous";
}

function readStoredVoiceSpokenReplies(): boolean {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return true;
    const v = ls.getItem(VOICE_SPOKEN_REPLIES_STORAGE_KEY);
    if (v === "0" || v === "false") return false;
  } catch {
    // ignore
  }
  return true;
}

function randomAssistantMessageId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `va-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function transcribeFailureUserMessage(error: unknown): string {
  const s = String(error);
  if (s.includes("403") || s.includes("Forbidden")) {
    return "Voice could not reach the transcription service (access denied). See browser/base/content/assistant/VOICE_INPUT_SETUP.md or ask your admin to check AWS IAM and the Lambda URL.";
  }
  if (/Authentication required/i.test(s)) {
    return "Please sign in to use voice. Voice transcription needs an authenticated Oasis session.";
  }
  return "Could not transcribe audio. Check your connection and try again.";
}

function normalizeTextForSpeech(text: string): string {
  const normalized = text
    .replace(/<[^>]*>/g, "")
    .replace(/^[\t ]*[-*+]\s+/gm, "")
    .replace(/^[\t ]*\d+\.\s+/gm, "")
    .replace(/[#*_`~\[\]()>|]/g, "")
    .replace(/[–—]+/g, ", ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/([.,!?;:])([^\s])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_TTS_CHARS)
    .trim();

  if (!normalized) {
    return "";
  }
  if (!/[.!?]$/.test(normalized)) {
    return `${normalized}.`;
  }
  return normalized;
}

function summarizeUrlForSpeech(value: string): string {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (!host) {
      return "that page";
    }
    return host;
  } catch {
    return "that page";
  }
}

function makeSpeechFriendlyReply(text: string): string {
  const raw = String(text || "").trim();
  if (!raw) {
    return "";
  }

  const missingUrl =
    "Okay. Tell me the website you'd like me to open.";
  const missingQuery =
    "Okay. What should I search for?";

  if (/^Missing 'url' argument\.?$/i.test(raw)) {
    return missingUrl;
  }
  if (/^Missing 'query' argument\.?$/i.test(raw)) {
    return missingQuery;
  }
  if (/^Opened URL in a new tab:/i.test(raw)) {
    return "Done. I've opened that in a new tab.";
  }
  if (/^Opened web search for/i.test(raw)) {
    return "I've opened a web search.";
  }
  if (/^Opened a new tab to the right of:/i.test(raw)) {
    return "I've opened a new tab.";
  }
  if (
    /^Cannot open URL/i.test(raw) ||
    /^Cannot open web search/i.test(raw) ||
    /^Browser UI not available\.?$/i.test(raw)
  ) {
    return "I can't open a new tab right now.";
  }

  const openedUrlMatch = raw.match(
    /^(?:Opened URL in a new tab|Successfully opened URL|Opened in new tab):\s+(.+)$/i
  );
  if (openedUrlMatch) {
    return `Done. I've opened ${summarizeUrlForSpeech(openedUrlMatch[1])} in a new tab.`;
  }

  const searchMatch = raw.match(
    /^Opened web search for "?(.+?)"? in a new tab\.?$/i
  );
  if (searchMatch) {
    return `Sure. I opened a web search for ${searchMatch[1]}.`;
  }

  const tabActionRewrites: Array<[RegExp, string]> = [
    [/^Closed tab:/i, "Closed that tab."],
    [/^Reloaded tab:/i, "Reloaded that tab."],
    [/^Pinned tab:/i, "Pinned that tab."],
    [/^Unpinned tab:/i, "Unpinned that tab."],
    [/^Moved tab to start:/i, "Moved that tab to the start."],
    [/^Moved tab to end:/i, "Moved that tab to the end."],
    [/^Duplicated tab:/i, "Duplicated that tab."],
    [/^Bookmarked tab:/i, "Bookmarked that tab."],
    [/^Selected all tabs in this window\.?$/i, "Selected all tabs in this window."],
    [/^Closed \d+ duplicate tab\(s\)\.?$/i, "Closed the duplicate tabs."],
    [/^Closed \d+ tab\(s\) to the right\.?$/i, "Closed the tabs to the right."],
    [/^Closed \d+ tab\(s\) to the left\.?$/i, "Closed the tabs to the left."],
    [/^Closed \d+ other tab\(s\)\.?$/i, "Closed the other tabs."],
  ];
  for (const [pattern, replacement] of tabActionRewrites) {
    if (pattern.test(raw)) {
      return replacement;
    }
  }

  const shortened = raw.replace(/https?:\/\/\S+/gi, url => summarizeUrlForSpeech(url));
  const sentenceMatch = shortened.match(/^([^.!?]+[.!?])(?:\s+.*)?$/s);
  if (sentenceMatch && sentenceMatch[1].length < shortened.length) {
    return sentenceMatch[1].trim();
  }
  return shortened;
}

export class VoiceAgentService {
  private state: VoiceAgentState = "idle";
  private listeners = new Set<VoiceAgentListener>();
  private mediaRecorder: MediaRecorder | null = null;
  private recorderMimeType = "";
  private recorderStartedAt = 0;
  private chunkTimeline: RecorderChunk[] = [];
  private micStream: MediaStream | null = null;
  private ttsAudio: HTMLAudioElement | null = null;
  private ttsObjectUrl: string | null = null;
  private aborted = false;
  private runAssistant: RunAssistantFn | null = null;
  private preferredListeningSource: VoiceAgentListeningSource = "handsfree";
  private listeningSourceActive: VoiceAgentListeningSource | null = null;

  private audioContext: AudioContext | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private vadData: Uint8Array | null = null;
  private pcmProcessor: ScriptProcessorNode | null = null;
  private pcmSink: GainNode | null = null;
  private pcmTimeline: PcmChunk[] = [];
  private audioLoopId = 0;
  private audioLoopRunning = false;
  private ttsAnalyser: AnalyserNode | null = null;
  private ttsAnalyserData: Uint8Array | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private speechActive = false;
  private speechOnFrames = 0;
  private silenceMs = 0;
  private utteranceStartTime = 0;
  private utteranceBufferStartMs = 0;
  private recentSpeechDetectedAt = 0;
  private peakSpeechRms = 0;
  private currentVadThreshold = VAD_MIN_THRESHOLD;
  private ambientNoiseFloor = 0;
  private ambientSampleCount = 0;
  private lastVadFrameMs = 0;
  private finishUtterancePromise: Promise<void> | null = null;
  private ttsRequestId = 0;
  private activeSpeakCleanup: (() => void) | null = null;
  private captureMode: VoiceCaptureMode = readStoredCaptureMode();
  private speechPrimeFrames = 0;
  private vadSpeechStreakFrames = 0;
  private voiceSpokenRepliesEnabled = readStoredVoiceSpokenReplies();

  constructor() {
    window.addEventListener(
      TTS_STOP_EVENT,
      this.handleExternalTtsStop as EventListener
    );
  }

  setRunAssistant(fn: RunAssistantFn) {
    this.runAssistant = fn;
  }

  getListeningSource(): VoiceAgentListeningSource | null {
    return this.listeningSourceActive;
  }

  getUserSpeaking(): boolean {
    return this.speechActive;
  }

  getCaptureMode(): VoiceCaptureMode {
    return this.captureMode;
  }

  setCaptureMode(mode: VoiceCaptureMode): void {
    this.captureMode = mode;
    try {
      globalThis.localStorage?.setItem(VOICE_CAPTURE_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    assistantLogger.warn("voice", "capture mode set", { mode });
  }

  getVoiceSpokenRepliesEnabled(): boolean {
    return this.voiceSpokenRepliesEnabled;
  }

  setVoiceSpokenRepliesEnabled(enabled: boolean): void {
    this.voiceSpokenRepliesEnabled = enabled;
    try {
      globalThis.localStorage?.setItem(
        VOICE_SPOKEN_REPLIES_STORAGE_KEY,
        enabled ? "1" : "0"
      );
    } catch {
      // ignore
    }
    assistantLogger.warn("voice", "orb spoken replies", { enabled });
  }

  on(listener: VoiceAgentListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): VoiceAgentState {
    return this.state;
  }

  private handleExternalTtsStop = (
    event: CustomEvent<{ source?: string }>
  ): void => {
    if (event.detail?.source === "voice-agent") {
      return;
    }
    this.stopSpeaking();
  };

  private emit(event: VoiceAgentEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  private setState(
    nextState: VoiceAgentState,
    listeningSource?: VoiceAgentListeningSource
  ) {
    this.state = nextState;
    if (nextState === "listening" && listeningSource) {
      this.listeningSourceActive = listeningSource;
      this.emit({ type: "state", state: nextState, listeningSource });
      return;
    }
    if (nextState !== "listening") {
      this.listeningSourceActive = null;
    }
    this.emit({ type: "state", state: nextState });
  }

  private emitVad(userSpeaking: boolean) {
    this.emit({ type: "vad", userSpeaking });
  }

  private emitListeningPhase(phase: "echo_guard" | "capturing"): void {
    this.emit({ type: "listening_phase", phase });
  }

  private setMicTracksEnabled(enabled: boolean): void {
    const tracks = this.micStream?.getAudioTracks() ?? [];
    tracks.forEach(track => {
      track.enabled = enabled;
    });
  }

  private getAudioConstraints(): MediaTrackConstraints {
    const supported =
      navigator.mediaDevices?.getSupportedConstraints?.() || {};
    const constraints: MediaTrackConstraints & Record<string, unknown> = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    if (supported.channelCount) {
      constraints.channelCount = { ideal: 1 };
    }
    if (supported.sampleRate) {
      constraints.sampleRate = { ideal: TARGET_TRANSCRIBE_SAMPLE_RATE };
    }
    if (supported.sampleSize) {
      constraints.sampleSize = { ideal: 16 };
    }
    if (
      "suppressLocalAudioPlayback" in supported &&
      supported.suppressLocalAudioPlayback
    ) {
      constraints.suppressLocalAudioPlayback = true;
    }

    return constraints;
  }

  async startConversation(
    listeningSource: VoiceAgentListeningSource = "handsfree"
  ): Promise<void> {
    if (this.state !== "idle") {
      return;
    }

    this.aborted = false;
    this.preferredListeningSource = listeningSource;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.emit({
        type: "error",
        message: "Microphone is not available in this page.",
      });
      return;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: this.getAudioConstraints(),
      });
    } catch {
      if (this.aborted) {
        return;
      }
      this.emit({ type: "error", message: "Microphone access denied." });
      return;
    }

    if (this.aborted) {
      this.releaseMic();
      return;
    }

    this.setupAnalyser();
    if (!this.analyser || !this.audioContext) {
      this.releaseAudioContext();
      this.releaseMic();
      this.emit({
        type: "error",
        message: "Could not start audio analysis.",
      });
      return;
    }

    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (error) {
        assistantLogger.error("voice-agent", "AudioContext.resume failed", error);
        this.releaseAudioContext();
        this.releaseMic();
        this.emit({
          type: "error",
          message: "Tap the microphone button to enable listening.",
        });
        return;
      }
    }

    this.setMicTracksEnabled(true);
    this.resetListeningCalibration();
    this.setState("listening", listeningSource);

    const captureStarted = await this.startContinuousCapture();
    if (!captureStarted) {
      this.releaseAudioContext();
      this.releaseMic();
      this.setState("idle");
      this.emit({
        type: "error",
        message: "Could not start microphone capture.",
      });
      return;
    }

    try {
      const track = this.micStream.getAudioTracks()[0];
      assistantLogger.info("voice-agent", "Microphone capture started", {
        mimeType: this.recorderMimeType,
        settings: track?.getSettings?.() || null,
      });
    } catch {
      // ignore
    }

    this.ensureAudioLoop();
    this.emitListeningPhase("capturing");
    this.speechPrimeFrames = 0;
  }

  private setupAnalyser(): void {
    if (!this.micStream) {
      return;
    }
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.micSource = source;
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.65;
      source.connect(this.analyser);
      this.vadData = new Uint8Array(this.analyser.fftSize);

      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      const sink = this.audioContext.createGain();
      sink.gain.value = 0;
      processor.onaudioprocess = event => {
        const audioEvent = event as AudioProcessingEvent;
        if (this.state !== "listening" || this.aborted) {
          return;
        }
        const input = audioEvent.inputBuffer;
        const sampleRate = input.sampleRate || this.audioContext?.sampleRate || 48000;
        if (!sampleRate || input.length <= 0) {
          return;
        }
        const mono = new Float32Array(input.length);
        const channels = Math.max(1, input.numberOfChannels);
        for (let channel = 0; channel < channels; channel++) {
          const data = input.getChannelData(channel);
          for (let index = 0; index < data.length; index++) {
            mono[index] += data[index]! / channels;
          }
        }
        const endMs = nowMs();
        const durationMs = (mono.length / sampleRate) * 1000;
        this.pcmTimeline.push({
          samples: mono,
          startMs: endMs - durationMs,
          endMs,
          sampleRate,
        });
        this.trimPcmTimeline(endMs);
      };
      source.connect(processor);
      processor.connect(sink);
      sink.connect(this.audioContext.destination);
      this.pcmProcessor = processor;
      this.pcmSink = sink;
    } catch (error) {
      assistantLogger.error("voice-agent", "Analyser setup failed", error);
    }
  }

  private resetListeningCalibration(): void {
    this.speechActive = false;
    this.speechOnFrames = 0;
    this.speechPrimeFrames = 0;
    this.vadSpeechStreakFrames = 0;
    this.silenceMs = 0;
    this.utteranceStartTime = 0;
    this.utteranceBufferStartMs = 0;
    this.recentSpeechDetectedAt = 0;
    this.peakSpeechRms = 0;
    this.ambientNoiseFloor = 0;
    this.ambientSampleCount = 0;
    this.currentVadThreshold = VAD_MIN_THRESHOLD;
    this.emitVad(false);
  }

  private computeRms(): number {
    if (!this.analyser || !this.vadData) {
      return 0;
    }
    this.analyser.getByteTimeDomainData(this.vadData);
    let sum = 0;
    for (let index = 0; index < this.vadData.length; index++) {
      const value = (this.vadData[index]! - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / this.vadData.length);
  }

  private computeRmsFromAnalyser(analyser: AnalyserNode, data: Uint8Array): number {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index++) {
      const value = (data[index]! - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / data.length);
  }

  private normalizeLevel(rms: number): number {
    return Math.min(1, Math.max(0, rms * 7));
  }

  private observeAmbientNoise(rms: number): void {
    if (this.speechActive) {
      return;
    }
    const sample =
      this.ambientSampleCount === 0
        ? rms
        : this.ambientNoiseFloor * 0.92 + rms * 0.08;
    this.ambientNoiseFloor = sample;
    this.ambientSampleCount += 1;
    const derivedThreshold = Math.max(
      sample * VAD_THRESHOLD_MULTIPLIER,
      sample + 0.006
    );
    this.currentVadThreshold = clamp(
      derivedThreshold,
      VAD_MIN_THRESHOLD,
      VAD_MAX_THRESHOLD
    );
  }

  private emitAudioLevels(): void {
    let mic = 0;
    let tts = 0;
    if (this.state === "listening" && this.analyser) {
      mic = this.normalizeLevel(this.computeRms());
    } else if (
      this.state === "speaking" &&
      this.ttsAnalyser &&
      this.ttsAnalyserData
    ) {
      tts = this.normalizeLevel(
        this.computeRmsFromAnalyser(this.ttsAnalyser, this.ttsAnalyserData)
      );
    }
    this.emit({ type: "audio_level", mic, tts });
  }

  private ensureAudioLoop(): void {
    if (this.audioLoopRunning) {
      return;
    }
    this.audioLoopRunning = true;
    this.lastVadFrameMs = nowMs();
    const tick = () => {
      if (!this.audioLoopRunning || this.aborted) {
        return;
      }

      this.emitAudioLevels();

      if (this.state === "listening") {
        const now = nowMs();
        const dt = Math.min(120, now - this.lastVadFrameMs);
        this.lastVadFrameMs = now;

        const rms = this.computeRms();
        this.observeAmbientNoise(rms);
        const speech = rms > this.currentVadThreshold;
        const primeSpeech = rms > PRECISE_START_RMS_THRESHOLD;

        if (this.captureMode === "precise") {
          if (speech) {
            this.recentSpeechDetectedAt = now;
            this.peakSpeechRms = Math.max(this.peakSpeechRms, rms);
            this.silenceMs = 0;
          }

          if (!this.speechActive) {
            if (primeSpeech) {
              const next = advanceVadSpeechDebounce(
                this.vadSpeechStreakFrames,
                true,
                VAD_SPEECH_DEBOUNCE_FRAMES
              );
              this.vadSpeechStreakFrames = next.streak;
              if (next.commit) {
                this.beginUtteranceRecording(now, rms);
              }
            } else {
              this.vadSpeechStreakFrames = 0;
            }
          }
        } else if (speech) {
          this.recentSpeechDetectedAt = now;
          this.peakSpeechRms = Math.max(this.peakSpeechRms, rms);
          this.silenceMs = 0;
          this.speechOnFrames += 1;
          if (!this.speechActive && this.speechOnFrames >= VAD_SPEECH_ON_FRAMES) {
            this.beginUtteranceRecording(now, rms);
          }
        } else {
          this.speechOnFrames = 0;
          if (this.speechActive) {
            this.silenceMs += dt;
            if (this.silenceMs >= VAD_SILENCE_MS) {
              void this.finishUtteranceRecording();
            }
          }
        }
      }

      this.audioLoopId = requestAnimationFrame(tick);
    };
    this.audioLoopId = requestAnimationFrame(tick);
  }

  private stopAudioLoop(): void {
    this.audioLoopRunning = false;
    if (this.audioLoopId) {
      cancelAnimationFrame(this.audioLoopId);
      this.audioLoopId = 0;
    }
  }

  private trimChunkTimeline(now = nowMs()): void {
    const keepSince = this.utteranceBufferStartMs
      ? Math.max(
          this.utteranceBufferStartMs - RECORDER_SLICE_MS,
          now - MAX_CAPTURE_HISTORY_MS
        )
      : now - PRE_ROLL_MS;
    this.chunkTimeline = this.chunkTimeline.filter(
      chunk => chunk.timestampMs >= keepSince
    );
  }

  private trimPcmTimeline(now = nowMs()): void {
    const keepSince = this.utteranceBufferStartMs
      ? Math.max(
          this.utteranceBufferStartMs - RECORDER_SLICE_MS,
          now - MAX_CAPTURE_HISTORY_MS
        )
      : now - PRE_ROLL_MS;
    this.pcmTimeline = this.pcmTimeline.filter(chunk => chunk.endMs >= keepSince);
  }

  private async startContinuousCapture(): Promise<boolean> {
    if (!this.micStream) {
      return false;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      return true;
    }

    const mimeType = this.pickMimeType();
    let recorder: MediaRecorder | null = null;

    try {
      recorder = new MediaRecorder(
        this.micStream,
        mimeType
          ? { mimeType, audioBitsPerSecond: 64000 }
          : { audioBitsPerSecond: 64000 }
      );
    } catch {
      try {
        recorder = new MediaRecorder(
          this.micStream,
          mimeType ? { mimeType } : {}
        );
      } catch (error) {
        assistantLogger.error("voice-agent", "MediaRecorder failed", error);
        return false;
      }
    }

    this.chunkTimeline = [];
    this.pcmTimeline = [];
    this.mediaRecorder = recorder;
    this.recorderMimeType = recorder.mimeType || mimeType || "audio/webm";
    this.recorderStartedAt = nowMs();
    recorder.ondataavailable = (event: Event) => {
      const blob = eventBlob(event);
      if (!blob || blob.size <= 0) {
        return;
      }
      this.chunkTimeline.push({
        blob,
        timestampMs: nowMs(),
      });
      this.trimChunkTimeline();
    };

    try {
      recorder.start(RECORDER_SLICE_MS);
      return true;
    } catch (error) {
      assistantLogger.error("voice-agent", "MediaRecorder.start failed", error);
      this.mediaRecorder = null;
      return false;
    }
  }

  private async stopContinuousCapture(): Promise<void> {
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    await new Promise<void>(resolve => {
      const handleStop = () => {
        resolve();
      };
      recorder.addEventListener("stop", handleStop, { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
  }

  private beginUtteranceRecording(now: number, rms: number): void {
    this.speechActive = true;
    this.utteranceStartTime = now;
    this.utteranceBufferStartMs = Math.max(
      this.recorderStartedAt,
      now - PRE_ROLL_MS
    );
    this.peakSpeechRms = Math.max(this.peakSpeechRms, rms);
    this.emitVad(true);
  }

  private resolveUtteranceStartMs(forceFlush: boolean): number {
    if (this.utteranceBufferStartMs > 0) {
      return this.utteranceBufferStartMs;
    }
    if (!forceFlush || this.chunkTimeline.length === 0) {
      return 0;
    }
    if (
      this.recentSpeechDetectedAt <= 0 &&
      this.speechOnFrames === 0 &&
      !this.speechActive
    ) {
      return 0;
    }
    const latestTimestamp =
      this.chunkTimeline[this.chunkTimeline.length - 1]?.timestampMs || nowMs();
    return Math.max(
      this.recorderStartedAt,
      latestTimestamp - MANUAL_FLUSH_LOOKBACK_MS
    );
  }

  private buildUtteranceBlob(startMs: number): Blob {
    const selectedChunks = this.chunkTimeline
      .filter(chunk => chunk.timestampMs >= startMs - RECORDER_SLICE_MS)
      .map(chunk => chunk.blob);
    const mimeType = this.recorderMimeType || "audio/webm";
    return new Blob(selectedChunks, { type: mimeType });
  }

  private buildUtterancePcm(startMs: number): UtterancePcm | null {
    const selected = this.pcmTimeline.filter(
      chunk => chunk.endMs >= startMs - RECORDER_SLICE_MS
    );
    if (selected.length === 0) {
      return null;
    }
    const sampleRate = selected[0]?.sampleRate || this.audioContext?.sampleRate || 48000;
    const trimmedChunks: Float32Array[] = [];
    let totalLength = 0;

    for (const chunk of selected) {
      let startIndex = 0;
      if (chunk.startMs < startMs && chunk.endMs > startMs) {
        startIndex = Math.max(
          0,
          Math.min(
            chunk.samples.length,
            Math.floor(((startMs - chunk.startMs) / 1000) * chunk.sampleRate)
          )
        );
      } else if (chunk.endMs <= startMs) {
        continue;
      }
      const slice = chunk.samples.subarray(startIndex);
      if (slice.length === 0) {
        continue;
      }
      trimmedChunks.push(new Float32Array(slice));
      totalLength += slice.length;
    }

    if (totalLength === 0) {
      return null;
    }

    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of trimmedChunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return { samples, sampleRate };
  }

  private resetUtteranceState(): void {
    this.speechActive = false;
    this.silenceMs = 0;
    this.speechOnFrames = 0;
    this.utteranceStartTime = 0;
    this.utteranceBufferStartMs = 0;
    this.peakSpeechRms = 0;
    this.emitVad(false);
  }

  private finishUtteranceRecording(
    forceFlush = false,
    manualStop = false
  ): Promise<void> {
    if (this.finishUtterancePromise) {
      return this.finishUtterancePromise;
    }

    const promise = this.finishUtteranceRecordingInternal(
      forceFlush,
      manualStop
    ).finally(() => {
      if (this.finishUtterancePromise === promise) {
        this.finishUtterancePromise = null;
      }
    });
    this.finishUtterancePromise = promise;
    return promise;
  }

  private async finishUtteranceRecordingInternal(
    forceFlush = false,
    manualStop = false
  ): Promise<void> {
    const startMs = this.resolveUtteranceStartMs(forceFlush);
    if (!startMs) {
      this.resetUtteranceState();
      return;
    }

    const durationMs = Math.max(0, nowMs() - startMs);
    const rms = this.peakSpeechRms || undefined;

    await this.stopContinuousCapture();
    if (this.aborted) {
      this.chunkTimeline = [];
      this.pcmTimeline = [];
      this.resetUtteranceState();
      return;
    }
    const audioBlob = this.buildUtteranceBlob(startMs);
    const pcm = this.buildUtterancePcm(startMs);
    this.chunkTimeline = [];
    this.pcmTimeline = [];
    this.resetUtteranceState();

    if (this.aborted) {
      return;
    }
    const minMs = manualStop ? MANUAL_STOP_MIN_UTTERANCE_MS : VAD_MIN_UTTERANCE_MS;
    const minBytes = manualStop
      ? MANUAL_STOP_MIN_UTTERANCE_BYTES
      : this.captureMode === "precise"
        ? AUTO_MIN_UTTERANCE_BYTES_PRECISE
        : MIN_UTTERANCE_BYTES;
    if (durationMs < minMs || audioBlob.size < minBytes) {
      if (manualStop) {
        this.emit({
          type: "error",
          message:
            "Recording was too short to transcribe. Hold the mic a moment longer, then tap the orb again.",
        });
      }
      if (!this.aborted) {
        this.resumeListeningAfterTurn();
      }
      return;
    }

    await this.processUtteranceBlob(audioBlob, { durationMs, rms }, pcm, manualStop);
  }

  private buildRawUtteranceBlob(
    audioBlob: Blob,
    details: { durationMs: number; rms?: number }
  ): PreparedUtterance | null {
    const mimeType = audioBlob.type || this.recorderMimeType || "audio/webm";
    if (audioBlob.size < 256) {
      return null;
    }
    return {
      blob: audioBlob,
      captureMeta: {
        preprocessed: false,
        mimeType,
        durationMs: details.durationMs,
        ...(typeof details.rms === "number" ? { rms: details.rms } : {}),
      },
    };
  }

  private async prepareUtteranceBlob(
    audioBlob: Blob,
    details: { durationMs: number; rms?: number },
    pcm?: UtterancePcm | null
  ): Promise<PreparedUtterance | null> {
    if (!pcm) {
      assistantLogger.warn(
        "voice-agent",
        "PCM audio was unavailable; falling back to recorded audio upload",
        {
          originalMimeType: audioBlob.type || this.recorderMimeType || "audio/webm",
          durationMs: details.durationMs,
        }
      );
      return this.buildRawUtteranceBlob(audioBlob, details);
    }

    try {
      const processedBlob = await this.preprocessPcmUtterance(
        pcm.samples,
        pcm.sampleRate
      );
      if (!processedBlob || processedBlob.size < 256) {
        assistantLogger.warn(
          "voice-agent",
          "PCM preprocessing produced no usable WAV; falling back to recorded audio upload",
          {
            originalMimeType: audioBlob.type || this.recorderMimeType || "audio/webm",
            durationMs: details.durationMs,
            pcmSampleRate: pcm.sampleRate,
            pcmSamples: pcm.samples.length,
          }
        );
        return this.buildRawUtteranceBlob(audioBlob, details);
      }
      return {
        blob: processedBlob,
        captureMeta: {
          preprocessed: true,
          mimeType: processedBlob.type || "audio/wav",
          durationMs: details.durationMs,
          ...(typeof details.rms === "number" ? { rms: details.rms } : {}),
          sampleRateHz: TARGET_TRANSCRIBE_SAMPLE_RATE,
          channels: 1,
        },
      };
    } catch (error) {
      assistantLogger.warn(
        "voice-agent",
        "Audio preprocessing failed; falling back to recorded audio upload",
        error
      );
      return this.buildRawUtteranceBlob(audioBlob, details);
    }
  }

  private async preprocessPcmUtterance(
    mono: Float32Array,
    sampleRate: number
  ): Promise<Blob | null> {
    if (!mono.length || !sampleRate) {
      return null;
    }
    const frameCount = Math.max(
      1,
      Math.ceil((mono.length / sampleRate) * TARGET_TRANSCRIBE_SAMPLE_RATE)
    );
    const offline = new OfflineAudioContext(
      1,
      frameCount,
      TARGET_TRANSCRIBE_SAMPLE_RATE
    );
    const inputBuffer = offline.createBuffer(1, mono.length, sampleRate);
    inputBuffer.copyToChannel(mono, 0);

    const source = offline.createBufferSource();
    source.buffer = inputBuffer;

    const highPass = offline.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 85;
    highPass.Q.value = 0.707;

    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    source.connect(highPass);
    highPass.connect(compressor);
    compressor.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    return this.encodeWavBlob(rendered);
  }

  private encodeWavBlob(buffer: AudioBuffer): Blob {
    const samples = buffer.getChannelData(0);
    let peak = 0;
    for (let index = 0; index < samples.length; index++) {
      peak = Math.max(peak, Math.abs(samples[index]!));
    }
    const gain = peak > 0 ? Math.min(4, 0.92 / peak) : 1;
    const bytesPerSample = 2;
    const dataLength = samples.length * bytesPerSample;
    const wav = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wav);

    const writeAscii = (offset: number, text: string) => {
      for (let index = 0; index < text.length; index++) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    };

    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index++) {
      const sample = clamp(samples[index]! * gain, -1, 1);
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += bytesPerSample;
    }

    return new Blob([wav], { type: "audio/wav" });
  }

  private async processUtteranceBlob(
    audioBlob: Blob,
    details: { durationMs: number; rms?: number },
    pcm?: UtterancePcm | null,
    manualStop = false
  ): Promise<void> {
    if (this.aborted) {
      return;
    }
    this.setState("transcribing");

    try {
      const prepared = await this.prepareUtteranceBlob(audioBlob, details, pcm);
      if (!prepared) {
        this.emit({
          type: "error",
          message: "I couldn't process that audio. Please try again.",
        });
        this.resumeListeningAfterTurn();
        return;
      }
      assistantLogger.info("voice-agent", "Audio preprocessing succeeded", {
        ...prepared.captureMeta,
        originalMimeType: audioBlob.type || this.recorderMimeType || "audio/webm",
      });
      assistantLogger.info("voice-agent", "Submitting utterance for transcription", {
        ...prepared.captureMeta,
        originalMimeType: audioBlob.type || this.recorderMimeType || "audio/webm",
      });

      const { transcript } = await transcribeAudio(prepared.blob, {
        captureMeta: prepared.captureMeta,
      });
      if (!transcript || this.aborted) {
        this.resumeListeningAfterTurn();
        return;
      }
      if (shouldDiscardAutoTranscript(transcript, manualStop)) {
        this.emit({
          type: "error",
          message:
            "That was too short to interpret. Say a bit more, or tap the orb when you are done.",
        });
        this.resumeListeningAfterTurn();
        return;
      }
      this.emit({ type: "userTranscript", text: transcript });
      await this.runTurn(transcript);
    } catch (error) {
      assistantLogger.error("voice-agent", "Transcription failed", error);
      this.emit({ type: "error", message: transcribeFailureUserMessage(error) });
      this.resumeListeningAfterTurn();
    }
  }

  async startListening(options?: {
    source?: VoiceAgentListeningSource;
  }): Promise<void> {
    if (this.state === "idle") {
      await this.startConversation(options?.source || "user");
    }
  }

  async finishListening(): Promise<void> {
    if (this.state !== "listening") {
      return;
    }
    await this.finishUtteranceRecording(true, true);
  }

  private resumeListeningAfterTurn(echoGuardMs = 0): void {
    void this.resumeListeningAfterTurnInternal(echoGuardMs);
  }

  private async resumeListeningAfterTurnInternal(
    echoGuardMs = 0
  ): Promise<void> {
    if (this.aborted) {
      return;
    }
    if (this.preferredListeningSource === "user") {
      this.setState("idle");
      return;
    }
    if (echoGuardMs > 0) {
      this.emitListeningPhase("echo_guard");
      await new Promise<void>(resolve => {
        setTimeout(resolve, echoGuardMs);
      });
      if (this.aborted) {
        return;
      }
    }
    this.lastVadFrameMs = nowMs();
    this.resetListeningCalibration();
    this.setMicTracksEnabled(true);
    if (this.audioContext?.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (error) {
        assistantLogger.error("voice-agent", "AudioContext.resume failed", error);
        if (!this.aborted) {
          this.stop();
          this.emit({
            type: "error",
            message: "Tap the microphone button to enable listening.",
          });
        }
        return;
      }
    }

    const started = await this.startContinuousCapture();
    if (!started) {
      if (!this.aborted) {
        this.stop();
        this.emit({
          type: "error",
          message: "Could not restart microphone capture.",
        });
      }
      return;
    }
    if (this.aborted) {
      return;
    }
    this.setState("listening", this.preferredListeningSource);
    this.ensureAudioLoop();
    this.emitListeningPhase("capturing");
    this.speechPrimeFrames = 0;
  }

  private async runTurn(transcript: string): Promise<void> {
    if (!this.runAssistant) {
      this.emit({ type: "error", message: "Assistant not connected." });
      this.resumeListeningAfterTurn();
      return;
    }

    const useSpoken = this.voiceSpokenRepliesEnabled;
    const win = globalThis as unknown as AssistantWindowLike;

    this.setState("thinking");
    this.setMicTracksEnabled(false);

    let aiMessageId: string | undefined;
    if (!useSpoken && typeof win.oasisVoiceAssistantTurnBegin === "function") {
      try {
        aiMessageId = win.oasisVoiceAssistantTurnBegin(transcript);
      } catch {
        aiMessageId = undefined;
      }
    }
    if (!useSpoken && !aiMessageId) {
      aiMessageId = randomAssistantMessageId();
    }

    const onChunk = (chunk: string) => {
      if (!useSpoken && aiMessageId && win.oasisVoiceAssistantStreamChunk) {
        try {
          win.oasisVoiceAssistantStreamChunk(aiMessageId, chunk);
        } catch {
          // ignore
        }
      }
    };

    const voiceDelivery: VoiceUiDelivery = useSpoken ? "spoken" : "text_chat";
    let fullResponse = "";
    try {
      fullResponse = await this.runAssistant(
        transcript,
        onChunk,
        "voice",
        aiMessageId,
        voiceDelivery
      );
    } catch (error) {
      assistantLogger.error("voice-agent", "Assistant failed", error);
      this.emit({ type: "error", message: "Assistant error." });
      this.resumeListeningAfterTurn();
      return;
    }

    if (this.aborted || !fullResponse.trim()) {
      this.emit({ type: "turn_done" });
      this.resumeListeningAfterTurn();
      return;
    }

    if (useSpoken) {
      this.setState("speaking");
      try {
        await this.speak(fullResponse);
      } catch (error) {
        assistantLogger.error("voice-agent", "TTS failed", error);
      }
      if (typeof win.oasisVoiceSpokenTurnMirror === "function") {
        try {
          win.oasisVoiceSpokenTurnMirror(transcript, fullResponse);
        } catch {
          // ignore
        }
      }
      this.emit({ type: "assistant_reply_text", text: fullResponse });
      this.emit({ type: "turn_done" });
      this.resumeListeningAfterTurn(ECHO_GUARD_MS_AFTER_TTS);
      return;
    }

    this.emit({ type: "turn_done" });
    this.resumeListeningAfterTurn(ECHO_GUARD_MS_AFTER_TEXT_REPLY);
  }

  private async speak(text: string): Promise<void> {
    const plain = normalizeTextForSpeech(makeSpeechFriendlyReply(text));
    if (!plain) {
      return;
    }

    const requestId = ++this.ttsRequestId;
    window.dispatchEvent(
      new CustomEvent(TTS_STOP_EVENT, {
        detail: { source: "voice-agent" },
      })
    );

    try {
      const blob = await textToSpeech(plain);
      if (
        this.aborted ||
        requestId !== this.ttsRequestId ||
        this.state !== "speaking"
      ) {
        return;
      }
      const url = URL.createObjectURL(blob);
      this.ttsObjectUrl = url;

      return new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          if (this.activeSpeakCleanup === finish) {
            this.activeSpeakCleanup = null;
          }
          this.cleanupAudio();
          resolve();
        };
        const audio = new Audio(url);
        this.ttsAudio = audio;
        this.activeSpeakCleanup = finish;
        this.disconnectTtsGraph();
        if (this.audioContext) {
          try {
            const source = this.audioContext.createMediaElementSource(audio);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.55;
            source.connect(analyser);
            analyser.connect(this.audioContext.destination);
            this.mediaElementSource = source;
            this.ttsAnalyser = analyser;
            this.ttsAnalyserData = new Uint8Array(analyser.fftSize);
          } catch (error) {
            assistantLogger.error("voice-agent", "TTS audio graph failed", error);
            this.disconnectTtsGraph();
          }
        }
        audio.onended = finish;
        audio.onerror = finish;
        void audio.play().catch(finish);
      });
    } catch {
      if (requestId === this.ttsRequestId) {
        this.activeSpeakCleanup = null;
      }
      this.cleanupAudio();
    }
  }

  private disconnectTtsGraph(): void {
    if (this.mediaElementSource) {
      try {
        this.mediaElementSource.disconnect();
      } catch {
        // ignore
      }
      this.mediaElementSource = null;
    }
    if (this.ttsAnalyser) {
      try {
        this.ttsAnalyser.disconnect();
      } catch {
        // ignore
      }
      this.ttsAnalyser = null;
    }
    this.ttsAnalyserData = null;
  }

  stop() {
    this.aborted = true;
    this.preferredListeningSource = "handsfree";
    this.ttsRequestId += 1;
    this.stopAudioLoop();
    const finish = this.activeSpeakCleanup;
    this.activeSpeakCleanup = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.mediaRecorder = null;
    this.chunkTimeline = [];
    this.recorderMimeType = "";
    this.resetUtteranceState();
    this.releaseAudioContext();
    this.releaseMic();
    if (finish) {
      finish();
    } else {
      this.cleanupAudio();
    }
    this.setState("idle");
  }

  stopSpeaking() {
    this.ttsRequestId += 1;
    const finish = this.activeSpeakCleanup;
    this.activeSpeakCleanup = null;
    if (finish) {
      finish();
    } else {
      this.cleanupAudio();
    }
    if (this.state === "speaking") {
      this.emit({ type: "turn_done" });
      this.resumeListeningAfterTurn(ECHO_GUARD_MS_AFTER_TTS_INTERRUPT);
    }
  }

  private releaseAudioContext(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
      }
      this.micSource = null;
    }
    if (this.pcmProcessor) {
      try {
        this.pcmProcessor.disconnect();
      } catch {
      }
      this.pcmProcessor.onaudioprocess = null;
      this.pcmProcessor = null;
    }
    if (this.pcmSink) {
      try {
        this.pcmSink.disconnect();
      } catch {
      }
      this.pcmSink = null;
    }
    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.vadData = null;
    this.pcmTimeline = [];
  }

  private releaseMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
  }

  private cleanupAudio() {
    this.disconnectTtsGraph();
    if (this.ttsAudio) {
      this.ttsAudio.pause();
      this.ttsAudio = null;
    }
    if (this.ttsObjectUrl) {
      URL.revokeObjectURL(this.ttsObjectUrl);
      this.ttsObjectUrl = null;
    }
  }

  private pickMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }
}

const voiceAgent = new VoiceAgentService();
export default voiceAgent;
