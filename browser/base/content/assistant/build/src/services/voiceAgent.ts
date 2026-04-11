import type { VoiceUiDelivery } from "../../../shared/contracts.js";
import { transcribeAudio, textToSpeech } from "../proxyClient.js";
import type { AssistantWindowLike } from "../types/runtime.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { advanceVadSpeechDebounce } from "../utils/voiceVadDebounce.js";
import { shouldDiscardAutoTranscript } from "../utils/voiceUtteranceGuards.js";

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

function eventBlob(event: Event): Blob | null {
  const data = (event as { data?: unknown }).data;
  return data instanceof Blob ? data : null;
}

function voicePreview(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "(empty)";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export type VoiceCaptureMode = "continuous" | "precise";

export const VOICE_CAPTURE_MODE_STORAGE_KEY = "oasis.voice.captureMode";

export const VOICE_SPOKEN_REPLIES_STORAGE_KEY = "oasis.voice.orbSpokenReplies";

function readStoredVoiceSpokenReplies(): boolean {
  try {
    const v = localStorage.getItem(VOICE_SPOKEN_REPLIES_STORAGE_KEY);
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

function readStoredCaptureMode(): VoiceCaptureMode {
  try {
    const v = localStorage.getItem(VOICE_CAPTURE_MODE_STORAGE_KEY);
    if (v === "precise") return "precise";
  } catch {
    // ignore
  }
  return "continuous";
}

function transcribeFailureUserMessage(error: unknown): string {
  const s = String(error);
  if (s.includes("403") || s.includes("Forbidden")) {
    return "Voice could not reach the transcription service (access denied). See browser/base/content/assistant/VOICE_INPUT_SETUP.md or ask your admin to check AWS IAM and the Lambda URL.";
  }
  return "Could not transcribe audio. Check your connection and try again.";
}

const VAD_RMS_THRESHOLD = 0.005;
const PRECISE_START_RMS_THRESHOLD = 0.014;
const PRECISE_START_FRAMES = 4;
const VAD_SILENCE_MS = 720;
const ECHO_GUARD_MS_AFTER_TTS = 700;
const ECHO_GUARD_MS_AFTER_TTS_INTERRUPT = 450;
const ECHO_GUARD_MS_AFTER_TEXT_REPLY = 180;
const VAD_SPEECH_DEBOUNCE_FRAMES = 3;
const VAD_MIN_UTTERANCE_MS = 240;
const RECORDER_SLICE_MS = 200;
const MIN_UTTERANCE_BYTES = 400;
const AUTO_MIN_UTTERANCE_BYTES_PRECISE = 800;
const MANUAL_STOP_MIN_UTTERANCE_MS = 120;
const MANUAL_STOP_MIN_UTTERANCE_BYTES = 120;

export class VoiceAgentService {
  private state: VoiceAgentState = "idle";
  private listeners = new Set<VoiceAgentListener>();
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private micStream: MediaStream | null = null;
  private ttsAudio: HTMLAudioElement | null = null;
  private ttsObjectUrl: string | null = null;
  private aborted = false;
  private runAssistant: RunAssistantFn | null = null;
  private continuousConversation = true;
  private listeningSourceActive: VoiceAgentListeningSource | null = null;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadFloatData: Float32Array | null = null;
  private micStreamSourceNode: MediaStreamAudioSourceNode | null = null;
  private micTapGain: GainNode | null = null;
  private audioLoopId = 0;
  private audioLoopRunning = false;
  private ttsAnalyser: AnalyserNode | null = null;
  private ttsAnalyserData: Uint8Array | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private speechActive = false;
  private seenSpeechInUtterance = false;
  private silenceMs = 0;
  private utteranceStartTime = 0;
  private lastVadFrameMs = 0;
  private vadDebugFrame = 0;
  private captureMode: VoiceCaptureMode = readStoredCaptureMode();
  private speechPrimeFrames = 0;
  private vadSpeechStreakFrames = 0;
  private utteranceSeq = 0;
  private segmentUtteranceSeq = 0;
  private voiceSpokenRepliesEnabled = readStoredVoiceSpokenReplies();

  setRunAssistant(fn: RunAssistantFn) {
    this.runAssistant = fn;
  }

  setContinuousConversation(enabled: boolean): void {
    this.continuousConversation = enabled;
  }

  getContinuousConversation(): boolean {
    return this.continuousConversation;
  }

  getListeningSource(): VoiceAgentListeningSource | null {
    return this.listeningSourceActive;
  }

  getUserSpeaking(): boolean {
    return this.speechActive && this.seenSpeechInUtterance;
  }

  getCaptureMode(): VoiceCaptureMode {
    return this.captureMode;
  }

  setCaptureMode(mode: VoiceCaptureMode): void {
    this.captureMode = mode;
    try {
      localStorage.setItem(VOICE_CAPTURE_MODE_STORAGE_KEY, mode);
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
      localStorage.setItem(
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

  private emit(event: VoiceAgentEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {}
    }
  }

  private setState(
    s: VoiceAgentState,
    listeningSource?: VoiceAgentListeningSource
  ) {
    const from = this.state;
    assistantLogger.debug("voice-state", "transition", {
      from,
      to: s,
      listeningSource:
        s === "listening"
          ? (listeningSource ?? this.listeningSourceActive)
          : undefined,
    });
    this.state = s;
    if (s === "listening" && listeningSource) {
      this.listeningSourceActive = listeningSource;
      this.emit({ type: "state", state: s, listeningSource });
    } else {
      if (s !== "listening") {
        this.listeningSourceActive = null;
      }
      this.emit({ type: "state", state: s });
    }
  }

  private emitVad(userSpeaking: boolean) {
    this.emit({ type: "vad", userSpeaking });
  }

  private emitListeningPhase(phase: "echo_guard" | "capturing"): void {
    assistantLogger.debug("voice-state", "listening_phase", {
      phase,
      agentState: this.state,
    });
    this.emit({ type: "listening_phase", phase });
  }

  private setMicTracksEnabled(enabled: boolean): void {
    const tracks = this.micStream?.getAudioTracks() ?? [];
    assistantLogger.debug("voice-mic", "tracks_enabled", {
      enabled,
      agentState: this.state,
      trackCount: tracks.length,
      labels: tracks.map(t => t.label || ""),
    });
    tracks.forEach(t => {
      t.enabled = enabled;
    });
  }

  async startConversation(): Promise<void> {
    if (this.state !== "idle") return;
    this.aborted = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.emit({
        type: "error",
        message: "Microphone is not available in this page.",
      });
      return;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      if (this.aborted) return;
      this.emit({ type: "error", message: "Microphone access denied." });
      return;
    }

    if (this.aborted) {
      this.releaseMic();
      return;
    }

    this.setupAnalyser();
    if (!this.analyser || !this.audioContext) {
      this.disconnectMicGraph();
      if (this.audioContext) {
        try {
          void this.audioContext.close();
        } catch {
          // ignore
        }
        this.audioContext = null;
      }
      this.analyser = null;
      this.vadFloatData = null;
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
      } catch (e) {
        assistantLogger.error("voice-agent", "AudioContext.resume failed", e);
        this.disconnectMicGraph();
        if (this.audioContext) {
          try {
            void this.audioContext.close();
          } catch {
            // ignore
          }
          this.audioContext = null;
        }
        this.analyser = null;
        this.vadFloatData = null;
        this.releaseMic();
        this.emit({
          type: "error",
          message: "Tap the microphone button to enable listening.",
        });
        return;
      }
    }

    this.setMicTracksEnabled(true);
    this.setState("listening", "handsfree");
    this.ensureAudioLoop();
    this.emitListeningPhase("capturing");
    this.speechPrimeFrames = 0;
    if (this.captureMode === "continuous") {
      this.startUtteranceCapture();
    }
    assistantLogger.warn(
      "voice",
      "session: listening (mic + capture started)",
      {
        audioContextState: this.audioContext?.state,
        captureMode: this.captureMode,
      }
    );
  }

  private setupAnalyser(): void {
    if (!this.micStream) return;
    try {
      this.audioContext = new AudioContext({ latencyHint: "interactive" });
      this.micStreamSourceNode = this.audioContext.createMediaStreamSource(
        this.micStream
      );
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.35;
      this.micStreamSourceNode.connect(this.analyser);
      this.micTapGain = this.audioContext.createGain();
      this.micTapGain.gain.value = 0;
      this.analyser.connect(this.micTapGain);
      this.micTapGain.connect(this.audioContext.destination);
      this.vadFloatData = new Float32Array(this.analyser.fftSize);
    } catch (e) {
      assistantLogger.error("voice-agent", "Analyser setup failed", e);
    }
  }

  private disconnectMicGraph(): void {
    try {
      this.micStreamSourceNode?.disconnect();
    } catch {
      // ignore
    }
    this.micStreamSourceNode = null;
    try {
      this.analyser?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.micTapGain?.disconnect();
    } catch {
      // ignore
    }
    this.micTapGain = null;
  }

  private computeRms(): number {
    if (!this.analyser || !this.vadFloatData) return 0;
    this.analyser.getFloatTimeDomainData(this.vadFloatData);
    let sum = 0;
    for (let i = 0; i < this.vadFloatData.length; i++) {
      const v = this.vadFloatData[i]!;
      sum += v * v;
    }
    return Math.sqrt(sum / this.vadFloatData.length);
  }

  private computeRmsFromAnalyser(an: AnalyserNode, buf: Uint8Array): number {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  private normalizeLevel(rms: number): number {
    return Math.min(1, Math.max(0, rms * 7));
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
    if (this.audioLoopRunning) return;
    this.audioLoopRunning = true;
    this.lastVadFrameMs = performance.now();
    const tick = () => {
      if (!this.audioLoopRunning || this.aborted) return;

      if (
        this.state === "listening" &&
        this.audioContext?.state === "suspended"
      ) {
        void this.audioContext.resume();
      }

      this.emitAudioLevels();

      if (this.state === "listening") {
        const now = performance.now();
        const dt = Math.min(120, now - this.lastVadFrameMs);
        this.lastVadFrameMs = now;

        const rms = this.computeRms();
        const speech = rms > VAD_RMS_THRESHOLD;
        const primeSpeech = rms > PRECISE_START_RMS_THRESHOLD;

        this.vadDebugFrame += 1;
        if (assistantLogger.isDebugEnabled() && this.vadDebugFrame % 60 === 0) {
          assistantLogger.debug("voice-vad", "tick", {
            utteranceSeq: this.segmentUtteranceSeq,
            rms: Number(rms.toFixed(5)),
            speech,
            speechActive: this.speechActive,
            seenSpeechInUtterance: this.seenSpeechInUtterance,
            silenceMs: Number(this.silenceMs.toFixed(0)),
            audioContextState: this.audioContext?.state,
            captureMode: this.captureMode,
          });
        }

        if (this.captureMode === "precise" && !this.mediaRecorder) {
          if (primeSpeech) {
            this.speechPrimeFrames += 1;
            if (this.speechPrimeFrames >= PRECISE_START_FRAMES) {
              this.speechPrimeFrames = 0;
              assistantLogger.debug("voice-vad", "precise_prime_complete", {
                threshold: PRECISE_START_RMS_THRESHOLD,
                frames: PRECISE_START_FRAMES,
              });
              this.startUtteranceCapture();
            }
          } else {
            this.speechPrimeFrames = 0;
          }
        }

        if (this.speechActive) {
          if (speech) {
            this.silenceMs = 0;
            if (!this.seenSpeechInUtterance) {
              const next = advanceVadSpeechDebounce(
                this.vadSpeechStreakFrames,
                true,
                VAD_SPEECH_DEBOUNCE_FRAMES
              );
              this.vadSpeechStreakFrames = next.streak;
              if (next.commit) {
                this.seenSpeechInUtterance = true;
                this.emitVad(true);
                assistantLogger.debug("voice-vad", "first_speech_in_segment", {
                  utteranceSeq: this.segmentUtteranceSeq,
                  rms: Number(rms.toFixed(5)),
                  threshold: VAD_RMS_THRESHOLD,
                  debounceFrames: VAD_SPEECH_DEBOUNCE_FRAMES,
                });
              }
            }
          } else {
            if (!this.seenSpeechInUtterance) {
              this.vadSpeechStreakFrames = 0;
            } else {
              this.silenceMs += dt;
              if (this.silenceMs >= VAD_SILENCE_MS) {
                assistantLogger.debug("voice-vad", "silence_window_complete", {
                  utteranceSeq: this.segmentUtteranceSeq,
                  silenceMs: Math.round(this.silenceMs),
                });
                void this.finishUtteranceRecording();
              }
            }
          }
        }
      }

      this.audioLoopId = requestAnimationFrame(tick);
    };
    this.audioLoopId = requestAnimationFrame(tick);
  }

  private armNextSegment(): void {
    if (this.state !== "listening" || this.aborted) return;
    assistantLogger.debug("voice", "arm_next_segment", {
      captureMode: this.captureMode,
      lastUtteranceSeq: this.segmentUtteranceSeq,
      willStartContinuous: this.captureMode === "continuous",
    });
    this.speechPrimeFrames = 0;
    if (this.captureMode === "continuous") {
      this.startUtteranceCapture();
    }
  }

  private stopAudioLoop(): void {
    this.audioLoopRunning = false;
    if (this.audioLoopId) {
      cancelAnimationFrame(this.audioLoopId);
      this.audioLoopId = 0;
    }
  }

  private startUtteranceCapture(): void {
    if (!this.micStream || this.mediaRecorder || this.state !== "listening") {
      return;
    }
    const mimeType = this.pickMimeType();
    try {
      this.mediaRecorder = new MediaRecorder(
        this.micStream,
        mimeType ? { mimeType } : {}
      );
    } catch (e) {
      assistantLogger.error("voice-agent", "MediaRecorder failed", e);
      return;
    }
    this.audioChunks = [];
    this.mediaRecorder.ondataavailable = (event: Event) => {
      const blob = eventBlob(event);
      if (blob && blob.size > 0) this.audioChunks.push(blob);
    };
    this.mediaRecorder.start(RECORDER_SLICE_MS);
    this.utteranceSeq += 1;
    this.segmentUtteranceSeq = this.utteranceSeq;
    this.speechActive = true;
    this.seenSpeechInUtterance = false;
    this.vadSpeechStreakFrames = 0;
    this.silenceMs = 0;
    this.utteranceStartTime = performance.now();
    assistantLogger.debug("voice", "segment_started", {
      utteranceSeq: this.segmentUtteranceSeq,
      captureMode: this.captureMode,
      mimeType: mimeType || "(browser default)",
      sliceMs: RECORDER_SLICE_MS,
    });
    assistantLogger.warn("voice", "MediaRecorder segment started", {
      utteranceSeq: this.segmentUtteranceSeq,
      mimeType: mimeType || "(browser default)",
      sliceMs: RECORDER_SLICE_MS,
    });
  }

  private async finishUtteranceRecording(options?: {
    manualStop?: boolean;
  }): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      this.resetUtteranceState();
      return;
    }

    const duration = performance.now() - this.utteranceStartTime;
    const rec = this.mediaRecorder;
    this.mediaRecorder = null;
    const minMs = options?.manualStop
      ? MANUAL_STOP_MIN_UTTERANCE_MS
      : VAD_MIN_UTTERANCE_MS;
    const minBytes = options?.manualStop
      ? MANUAL_STOP_MIN_UTTERANCE_BYTES
      : this.captureMode === "precise"
        ? AUTO_MIN_UTTERANCE_BYTES_PRECISE
        : MIN_UTTERANCE_BYTES;

    const finishedSeq = this.segmentUtteranceSeq;

    return new Promise<void>(resolve => {
      rec.onstop = async () => {
        this.resetUtteranceState();
        const mime = rec.mimeType || "audio/webm";
        const audioBlob = new Blob(this.audioChunks, { type: mime });
        this.audioChunks = [];

        if (this.aborted) {
          assistantLogger.debug("voice", "segment_finished", {
            utteranceSeq: finishedSeq,
            endReason: "aborted",
            durationMs: Math.round(duration),
            blobBytes: audioBlob.size,
            manualStop: !!options?.manualStop,
            captureMode: this.captureMode,
          });
          resolve();
          return;
        }
        if (duration < minMs || audioBlob.size < minBytes) {
          assistantLogger.debug("voice", "segment_finished", {
            utteranceSeq: finishedSeq,
            endReason: "discard_too_small",
            durationMs: Math.round(duration),
            blobBytes: audioBlob.size,
            minMs,
            minBytes,
            manualStop: !!options?.manualStop,
            captureMode: this.captureMode,
          });
          assistantLogger.warn("voice", "utterance discarded (too small)", {
            durationMs: Math.round(duration),
            blobBytes: audioBlob.size,
            minMs,
            minBytes,
            manualStop: !!options?.manualStop,
          });
          if (options?.manualStop) {
            this.emit({
              type: "error",
              message:
                "Recording was too short to transcribe. Hold the mic a moment longer, then tap the orb again.",
            });
          }
          if (this.state === "listening" && !this.aborted) {
            this.armNextSegment();
          }
          resolve();
          return;
        }

        const endReason = options?.manualStop ? "manual_stop" : "silence_vad";
        assistantLogger.debug("voice", "segment_finished", {
          utteranceSeq: finishedSeq,
          endReason,
          durationMs: Math.round(duration),
          blobBytes: audioBlob.size,
          mime,
          manualStop: !!options?.manualStop,
          captureMode: this.captureMode,
        });

        assistantLogger.warn(
          "voice",
          "utterance finalized, sending to transcribe",
          {
            utteranceSeq: finishedSeq,
            durationMs: Math.round(duration),
            blobBytes: audioBlob.size,
            mime,
            manualStop: !!options?.manualStop,
          }
        );

        await this.processUtteranceBlob(
          audioBlob,
          finishedSeq,
          !!options?.manualStop
        );
        resolve();
      };
      try {
        rec.stop();
      } catch {
        assistantLogger.debug("voice", "segment_stop_failed", {
          utteranceSeq: finishedSeq,
        });
        this.resetUtteranceState();
        resolve();
      }
    });
  }

  private resetUtteranceState(): void {
    this.speechActive = false;
    this.seenSpeechInUtterance = false;
    this.vadSpeechStreakFrames = 0;
    this.silenceMs = 0;
    this.emitVad(false);
  }

  private async processUtteranceBlob(
    audioBlob: Blob,
    utteranceSeq: number,
    manualStop: boolean
  ): Promise<void> {
    if (this.aborted) return;
    this.setState("transcribing");
    assistantLogger.warn("voice", "state: transcribing", {
      utteranceSeq,
      blobBytes: audioBlob.size,
      mimeType: audioBlob.type || "(none)",
    });

    try {
      const { transcript } = await transcribeAudio(audioBlob, {
        source: "orb",
        utteranceSeq,
      });
      if (!transcript || this.aborted) {
        assistantLogger.warn(
          "voice",
          "transcript empty or aborted after transcribe",
          {
            hadTranscript: !!transcript?.trim(),
            aborted: this.aborted,
          }
        );
        if (!this.aborted && !transcript?.trim()) {
          this.emit({
            type: "error",
            message:
              "Nothing was recognized. Try again, speak a bit longer, use headphones if audio is echoing, or use the chat bar microphone.",
          });
        }
        void this.resumeListeningAfterTurn();
        return;
      }
      if (shouldDiscardAutoTranscript(transcript, manualStop)) {
        assistantLogger.warn("voice", "transcript discarded (too short auto)", {
          chars: transcript.length,
          preview: voicePreview(transcript),
        });
        this.emit({
          type: "error",
          message:
            "That was too short to interpret. Say a bit more, or tap the orb when you are done.",
        });
        void this.resumeListeningAfterTurn();
        return;
      }

      this.emit({ type: "userTranscript", text: transcript });
      assistantLogger.warn("voice", "emitting userTranscript to UI", {
        chars: transcript.length,
        preview: voicePreview(transcript),
      });
      await this.runTurn(transcript);
    } catch (e) {
      assistantLogger.error("voice-agent", "Transcription failed", e);
      this.emit({ type: "error", message: transcribeFailureUserMessage(e) });
      void this.resumeListeningAfterTurn();
    }
  }

  async startListening(options?: {
    source?: VoiceAgentListeningSource;
  }): Promise<void> {
    if (this.state === "idle") {
      await this.startConversation();
    }
  }

  async finishListening(): Promise<void> {
    if (this.state !== "listening") {
      return;
    }
    if (this.audioContext?.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (e) {
        assistantLogger.error(
          "voice-agent",
          "AudioContext.resume on orb tap failed",
          e
        );
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      assistantLogger.debug("voice", "orb_manual_finish_requested", {
        utteranceSeq: this.segmentUtteranceSeq,
      });
      assistantLogger.warn("voice", "orb: manual stop (finish utterance now)");
      await this.finishUtteranceRecording({ manualStop: true });
      return;
    }
    this.emit({
      type: "error",
      message:
        "Nothing to send—the recorder was not running. Try opening voice again.",
    });
    this.stop();
  }

  private async resumeListeningAfterTurn(echoGuardMs = 0): Promise<void> {
    if (echoGuardMs > 0) {
      this.emitListeningPhase("echo_guard");
      assistantLogger.warn("voice", "echo guard: delay before next capture", {
        ms: echoGuardMs,
      });
      await new Promise<void>(resolve => {
        setTimeout(resolve, echoGuardMs);
      });
    }
    if (this.aborted) return;
    this.setMicTracksEnabled(true);
    this.lastVadFrameMs = performance.now();
    this.setState("listening", "handsfree");
    if (this.audioContext?.state === "suspended") {
      void this.audioContext.resume();
    }
    this.ensureAudioLoop();
    this.emitListeningPhase("capturing");
    this.speechPrimeFrames = 0;
    if (this.captureMode === "continuous") {
      this.startUtteranceCapture();
    }
  }

  private async runTurn(transcript: string): Promise<void> {
    if (!this.runAssistant) {
      this.emit({ type: "error", message: "Assistant not connected." });
      void this.resumeListeningAfterTurn();
      return;
    }

    const useSpoken = this.voiceSpokenRepliesEnabled;
    const win = globalThis as unknown as AssistantWindowLike;

    this.setState("thinking");
    this.setMicTracksEnabled(false);
    assistantLogger.warn("voice", "runAssistant (voice) starting", {
      transcriptChars: transcript.length,
      transcriptPreview: voicePreview(transcript),
      voiceDelivery: useSpoken ? "spoken" : "text_chat",
    });

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
    } catch (e) {
      assistantLogger.error("voice-agent", "Assistant failed", e);
      this.emit({ type: "error", message: "Assistant error." });
      void this.resumeListeningAfterTurn();
      return;
    }

    if (this.aborted || !fullResponse.trim()) {
      assistantLogger.warn(
        "voice",
        "runAssistant finished with no spoken reply",
        {
          aborted: this.aborted,
          responseChars: fullResponse.length,
        }
      );
      this.emit({ type: "turn_done" });
      void this.resumeListeningAfterTurn();
      return;
    }

    assistantLogger.warn("voice", "runAssistant reply (before TTS cleanup)", {
      responseChars: fullResponse.length,
      responsePreview: voicePreview(fullResponse, 280),
      voiceDelivery,
    });

    if (useSpoken) {
      this.setState("speaking");
      try {
        await this.speak(fullResponse);
      } catch (e) {
        assistantLogger.error("voice-agent", "TTS failed", e);
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
      await this.resumeListeningAfterTurn(ECHO_GUARD_MS_AFTER_TTS);
    } else {
      this.emit({ type: "turn_done" });
      await this.resumeListeningAfterTurn(ECHO_GUARD_MS_AFTER_TEXT_REPLY);
    }
  }

  private async speak(text: string): Promise<void> {
    const plain = text
      .replace(/<[^>]*>/g, "")
      .replace(/[#*_`~\[\]()>!|]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();
    if (!plain) return;

    assistantLogger.warn("voice", "TTS plain text (after strip)", {
      chars: plain.length,
      preview: voicePreview(plain, 280),
    });

    try {
      const blob = await textToSpeech(plain);
      if (this.aborted) return;
      const url = URL.createObjectURL(blob);
      this.ttsObjectUrl = url;

      return new Promise<void>(resolve => {
        const audio = new Audio(url);
        this.ttsAudio = audio;
        this.disconnectTtsGraph();
        if (this.audioContext) {
          try {
            const src = this.audioContext.createMediaElementSource(audio);
            const an = this.audioContext.createAnalyser();
            an.fftSize = 512;
            an.smoothingTimeConstant = 0.55;
            src.connect(an);
            an.connect(this.audioContext.destination);
            this.mediaElementSource = src;
            this.ttsAnalyser = an;
            this.ttsAnalyserData = new Uint8Array(an.fftSize);
          } catch (e) {
            assistantLogger.error("voice-agent", "TTS audio graph failed", e);
            this.disconnectTtsGraph();
          }
        }
        audio.onended = () => {
          this.cleanupAudio();
          resolve();
        };
        audio.onerror = () => {
          this.cleanupAudio();
          resolve();
        };
        void audio.play().catch(() => {
          this.cleanupAudio();
          resolve();
        });
      });
    } catch {
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
    this.stopAudioLoop();
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.resetUtteranceState();
    this.disconnectMicGraph();
    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.vadFloatData = null;
    this.releaseMic();
    this.cleanupAudio();
    this.setState("idle");
  }

  stopSpeaking() {
    this.cleanupAudio();
    if (this.state === "speaking") {
      this.emit({ type: "turn_done" });
      void this.resumeListeningAfterTurn(ECHO_GUARD_MS_AFTER_TTS_INTERRUPT);
    }
  }

  private releaseMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
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
      "audio/mp4",
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }
}

const voiceAgent = new VoiceAgentService();
export default voiceAgent;
