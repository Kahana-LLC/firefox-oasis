import { transcribeAudio } from "../proxyClient";

export class VoiceInputService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async startRecording(): Promise<void> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder with appropriate MIME type
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      
      this.audioChunks = [];
      
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
          
          // Lambda returns { transcript: "..." }
          resolve(result.transcript || '');
        } catch (error) {
          console.error("Error transcribing audio:", error);
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
