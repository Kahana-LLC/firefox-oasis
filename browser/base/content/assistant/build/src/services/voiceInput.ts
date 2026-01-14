import { transcribeAudio } from "../proxyClient";
import { UsageTracker } from "./usageTracker";
import { UsageLogger } from "./usageLogger";

export class VoiceInputService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private recordingStartTime: number = 0;
  private usageTracker = UsageTracker.getInstance();
  private usageLogger = UsageLogger.getInstance();

  // Event emitter for usage warnings
  private onUsageWarning?: (warnings: string[]) => void;

  async startRecording(): Promise<void> {
    try {
      // Check burst rate limits first (fastest check)
      const burstCheck = this.usageTracker.checkBurstLimits();
      if (!burstCheck.allowed) {
        const waitSeconds = Math.ceil((burstCheck.waitTimeMs || 0) / 1000);
        throw new Error(`Rate limited: ${burstCheck.reason}. Try again in ${waitSeconds}s.`);
      }

      // Check local usage limits (fast check)
      const localLimits = this.usageTracker.checkLimits();
      if (!localLimits.canTranscribe) {
        throw new Error("Monthly usage limit exceeded. Please try again next month.");
      }

      // Check server-side limits (Supabase) for accuracy
      const serverLimits = await this.usageLogger.checkLimits();
      if (!serverLimits.canTranscribe) {
        throw new Error("Server usage limit exceeded. Please try again later.");
      }

      // Combine warnings from both checks
      const allWarnings = [...localLimits.warnings, ...serverLimits.warnings];
      if (allWarnings.length > 0) {
        console.warn("[VoiceInput] Usage warnings:", allWarnings);
        // Optionally show warnings to user via a global event or callback
        this.emitUsageWarnings(allWarnings);
      }

      // Record this command attempt for burst tracking
      this.usageTracker.recordCommand();

      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder with appropriate MIME type
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.audioChunks = [];
      this.recordingStartTime = Date.now();

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
    } catch (error) {
      console.error("Error starting recording:", error);
      throw new Error("Failed to access microphone. Please check permissions.");
    }
  }

  async stopRecording(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No active recording"));
        return;
      }

      const duration = (Date.now() - this.recordingStartTime) / 1000; // duration in seconds

      this.mediaRecorder.onstop = async () => {
        try {
          // Stop all tracks in the stream
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
          }

          // Create audio blob from chunks
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });

          // Send to Deepgram via lambda
          const result = await transcribeAudio(audioBlob);
          const transcript = result.transcript || '';

          // Record successful transcription usage
          const provider = result.provider || 'deepgram';
          this.usageTracker.recordTranscription({
            provider,
            duration,
            transcriptLength: transcript.length
          });

          // Log to Supabase (async, don't wait)
          this.usageLogger.logTranscription({
            provider,
            duration_seconds: duration,
            transcript_length: transcript.length,
            cost_usd: result.cost
          });

          resolve(transcript);
        } catch (error) {
          console.error("Error transcribing audio:", error);

          // Record failed transcription attempt
          this.usageTracker.recordTranscriptionError('deepgram', error.message);

          // Log error to Supabase (async, don't wait)
          this.usageLogger.logTranscription({
            provider: 'deepgram',
            error_message: error.message
          });

          reject(error);
        } finally {
          this.mediaRecorder = null;
          this.audioChunks = [];
          this.stream = null;
          this.recordingStartTime = 0;
        }
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
  }

  // Set callback for usage warnings
  setUsageWarningCallback(callback: (warnings: string[]) => void): void {
    this.onUsageWarning = callback;
  }

  private emitUsageWarnings(warnings: string[]): void {
    if (this.onUsageWarning) {
      this.onUsageWarning(warnings);
    }

    // Also emit to window for global handlers
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voice-usage-warnings', {
        detail: { warnings }
      }));
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return ''; // Let browser choose default
  }
}

export default new VoiceInputService();
