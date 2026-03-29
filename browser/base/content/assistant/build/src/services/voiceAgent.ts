import { transcribeAudio, textToSpeech } from "../proxyClient.js";
import { assistantLogger } from "../utils/assistantLogger.js";

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
  | { type: "audio_level"; mic: number; tts: number };

type RunAssistantFn = (
  prompt: string,
  onChunk: (chunk: string) => void,
  inputType: "text" | "voice",
  messageId?: string
) => Promise<string>;

function eventBlob(event: Event): Blob | null {
  const data = (event as { data?: unknown }).data;
  return data instanceof Blob ? data : null;
}

const VAD_RMS_THRESHOLD = 0.028;
const VAD_SILENCE_MS = 720;
const VAD_SPEECH_ON_FRAMES = 4;
const VAD_MIN_UTTERANCE_MS = 320;
const RECORDER_SLICE_MS = 200;

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
  private vadData: Uint8Array | null = null;
  private audioLoopId = 0;
  private audioLoopRunning = false;
  private ttsAnalyser: AnalyserNode | null = null;
  private ttsAnalyserData: Uint8Array | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private speechActive = false;
  private speechOnFrames = 0;
  private silenceMs = 0;
  private utteranceStartTime = 0;
  private lastVadFrameMs = 0;

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
    return this.speechActive;
  }

  on(listener: VoiceAgentListener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getState(): VoiceAgentState {
    return this.state;
  }

  private emit(event: VoiceAgentEvent) {
    for (const l of this.listeners) {
      try { l(event); } catch {}
    }
  }

  private setState(s: VoiceAgentState, listeningSource?: VoiceAgentListeningSource) {
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
        this.releaseMic();
        this.emit({
          type: "error",
          message: "Tap the microphone button to enable listening.",
        });
        return;
      }
    }

    this.setState("listening", "handsfree");
    this.ensureAudioLoop();
  }

  private setupAnalyser(): void {
    if (!this.micStream) return;
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.65;
      source.connect(this.analyser);
      this.vadData = new Uint8Array(this.analyser.fftSize);
    } catch (e) {
      assistantLogger.error("voice-agent", "Analyser setup failed", e);
    }
  }

  private computeRms(): number {
    if (!this.analyser || !this.vadData) return 0;
    this.analyser.getByteTimeDomainData(this.vadData);
    let sum = 0;
    for (let i = 0; i < this.vadData.length; i++) {
      const v = (this.vadData[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.vadData.length);
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

      this.emitAudioLevels();

      if (this.state === "listening") {
        const now = performance.now();
        const dt = Math.min(120, now - this.lastVadFrameMs);
        this.lastVadFrameMs = now;

        const rms = this.computeRms();
        const speech = rms > VAD_RMS_THRESHOLD;

        if (speech) {
          this.silenceMs = 0;
          this.speechOnFrames += 1;
          if (!this.speechActive && this.speechOnFrames >= VAD_SPEECH_ON_FRAMES) {
            this.beginUtteranceRecording();
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

  private beginUtteranceRecording(): void {
    if (!this.micStream || this.mediaRecorder || this.state !== "listening") return;
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
    this.speechActive = true;
    this.utteranceStartTime = performance.now();
    this.emitVad(true);
  }

  private async finishUtteranceRecording(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      this.resetUtteranceState();
      return;
    }

    const duration = performance.now() - this.utteranceStartTime;
    const rec = this.mediaRecorder;
    this.mediaRecorder = null;

    return new Promise<void>(resolve => {
      rec.onstop = async () => {
        this.resetUtteranceState();
        const mime = rec.mimeType || "audio/webm";
        const audioBlob = new Blob(this.audioChunks, { type: mime });
        this.audioChunks = [];

        if (this.aborted) {
          resolve();
          return;
        }
        if (duration < VAD_MIN_UTTERANCE_MS || audioBlob.size < 800) {
          resolve();
          return;
        }

        await this.processUtteranceBlob(audioBlob);
        resolve();
      };
      try {
        rec.stop();
      } catch {
        this.resetUtteranceState();
        resolve();
      }
    });
  }

  private resetUtteranceState(): void {
    this.speechActive = false;
    this.silenceMs = 0;
    this.speechOnFrames = 0;
    this.emitVad(false);
  }

  private async processUtteranceBlob(audioBlob: Blob): Promise<void> {
    if (this.aborted) return;
    this.setState("transcribing");

    try {
      const { transcript } = await transcribeAudio(audioBlob);
      if (!transcript || this.aborted) {
        this.resumeListeningAfterTurn();
        return;
      }
      this.emit({ type: "userTranscript", text: transcript });
      await this.runTurn(transcript);
    } catch (e) {
      assistantLogger.error("voice-agent", "Transcription failed", e);
      this.emit({ type: "error", message: "Could not transcribe audio." });
      this.resumeListeningAfterTurn();
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
    if (this.state === "listening" && this.speechActive && this.mediaRecorder) {
      await this.finishUtteranceRecording();
    }
  }

  private resumeListeningAfterTurn(): void {
    if (this.aborted) return;
    this.lastVadFrameMs = performance.now();
    this.setState("listening", "handsfree");
    if (this.audioContext?.state === "suspended") {
      void this.audioContext.resume();
    }
    this.ensureAudioLoop();
  }

  private async runTurn(transcript: string): Promise<void> {
    if (!this.runAssistant) {
      this.emit({ type: "error", message: "Assistant not connected." });
      this.resumeListeningAfterTurn();
      return;
    }

    this.setState("thinking");

    let fullResponse = "";
    try {
      fullResponse = await this.runAssistant(transcript, () => {}, "voice");
    } catch (e) {
      assistantLogger.error("voice-agent", "Assistant failed", e);
      this.emit({ type: "error", message: "Assistant error." });
      this.resumeListeningAfterTurn();
      return;
    }

    if (this.aborted || !fullResponse.trim()) {
      this.emit({ type: "turn_done" });
      this.resumeListeningAfterTurn();
      return;
    }

    this.setState("speaking");
    try {
      await this.speak(fullResponse);
    } catch (e) {
      assistantLogger.error("voice-agent", "TTS failed", e);
    }
    this.emit({ type: "turn_done" });
    this.resumeListeningAfterTurn();
  }

  private async speak(text: string): Promise<void> {
    const plain = text
      .replace(/<[^>]*>/g, "")
      .replace(/[#*_`~\[\]()>!|]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();
    if (!plain) return;

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
    this.releaseMic();
    this.cleanupAudio();
    this.setState("idle");
  }

  stopSpeaking() {
    this.cleanupAudio();
    if (this.state === "speaking") {
      this.emit({ type: "turn_done" });
      this.resumeListeningAfterTurn();
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
