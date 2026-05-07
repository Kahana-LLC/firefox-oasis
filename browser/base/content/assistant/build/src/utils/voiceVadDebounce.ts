export function advanceVadSpeechDebounce(
  streak: number,
  speechFrame: boolean,
  debounceFrames: number
): { streak: number; commit: boolean } {
  if (!speechFrame) {
    return { streak: 0, commit: false };
  }
  const next = streak + 1;
  if (next >= debounceFrames) {
    return { streak: 0, commit: true };
  }
  return { streak: next, commit: false };
}
