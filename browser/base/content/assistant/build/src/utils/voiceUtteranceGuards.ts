export const MIN_AUTO_TRANSCRIPT_LENGTH = 5;

const SHORT_TRANSCRIPT_ALLOWLIST =
  /^(no|yes|ok|tab|stop|undo|redo|back|refresh|forward|close)$/i;

export function shouldDiscardAutoTranscript(
  transcript: string,
  manualStop: boolean
): boolean {
  if (manualStop) {
    return false;
  }
  const t = transcript.replace(/\s+/g, " ").trim();
  if (t.length === 0) {
    return false;
  }
  if (t.length >= MIN_AUTO_TRANSCRIPT_LENGTH) {
    return false;
  }
  if (SHORT_TRANSCRIPT_ALLOWLIST.test(t)) {
    return false;
  }
  return true;
}
