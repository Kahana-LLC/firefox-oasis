/** Voice input service — microphone recording, audio blob creation, and transcription via the remote Lambda. */
import { transcribeAudio } from "../proxyClient.js";
import { assistantLogger } from "../utils/assistantLogger.js";

function eventBlob(event: Event): Blob | null {
  const data = (event as { data?: unknown }).data;
  return data instanceof Blob ? data : null;
}

export class VoiceInputService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private composerUtteranceSeq = 0;
  private activeComposerSeq = 0;

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.composerUtteranceSeq += 1;
      this.activeComposerSeq = this.composerUtteranceSeq;
      const audioTracks = this.stream.getAudioTracks();
      const mimeType = this.getSupportedMimeType();
      assistantLogger.debug("voice-input", "recording_started", {
        utteranceSeq: this.activeComposerSeq,
        mimeType: mimeType || "(browser default)",
        tracks: audioTracks.map(t => {
          let deviceId = "";
          try {
            deviceId = t.getSettings?.().deviceId ?? "";
          } catch {
            // ignore
          }
          return { label: t.label || "", deviceId };
        }),
      });

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event: Event) => {
        const blob = eventBlob(event);
        if (blob && blob.size > 0) {
          this.audioChunks.push(blob);
        }
      };

      this.mediaRecorder.start();
    } catch (error) {
      assistantLogger.error("voice-input", "Error starting recording", error);
      throw new Error("Failed to access microphone. Please check permissions.");
    }
  }

  async stopRecording(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No active recording"));
        return;
      }

      const seq = this.activeComposerSeq;

      this.mediaRecorder.onstop = async () => {
        try {
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
          }

          const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });

          assistantLogger.debug("voice-input", "sending_transcribe", {
            utteranceSeq: seq,
            chunkCount: this.audioChunks.length,
            blobBytes: audioBlob.size,
            mimeType,
          });

          const result = await transcribeAudio(audioBlob, {
            source: "composer",
            utteranceSeq: seq,
          });

          // Lambda returns { transcript: "..." }
          resolve(result.transcript || "");
        } catch (error) {
          assistantLogger.error(
            "voice-input",
            "Error transcribing audio",
            error
          );
          reject(error);
        } finally {
          this.mediaRecorder = null;
          this.audioChunks = [];
          this.stream = null;
        }
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  cancelRecording(): void {
    assistantLogger.debug("voice-input", "recording_cancelled", {
      utteranceSeq: this.activeComposerSeq,
    });
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

  private getSupportedMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
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

export default new VoiceInputService();
