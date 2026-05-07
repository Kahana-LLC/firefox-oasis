import { useEffect, useState } from "preact/hooks";

const TYPE_MS = 88;
const PAUSE_FULL_MS = 3200;
const DELETE_MS = 52;
const PAUSE_EMPTY_MS = 900;

export function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq) {
      return;
    }
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return reduced;
}

export function useTypewriterCycle(
  strings: readonly string[],
  active: boolean,
  reducedMotion: boolean
): string {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active || strings.length === 0) {
      setText("");
      return;
    }

    if (reducedMotion) {
      setText(`Try: ${strings[0]}`);
      return;
    }

    let cancelled = false;
    let strIndex = 0;
    let charCount = 0;
    let phase: "type" | "pauseFull" | "delete" | "pauseEmpty" = "type";
    let timeoutId = 0;

    const schedule = (ms: number, fn: () => void) => {
      timeoutId = window.setTimeout(fn, ms);
    };

    const step = () => {
      if (cancelled) return;
      const full = strings[strIndex % strings.length];

      if (phase === "type") {
        if (charCount < full.length) {
          charCount += 1;
          setText(full.slice(0, charCount));
          schedule(TYPE_MS, step);
        } else {
          phase = "pauseFull";
          schedule(PAUSE_FULL_MS, step);
        }
        return;
      }

      if (phase === "pauseFull") {
        phase = "delete";
        step();
        return;
      }

      if (phase === "delete") {
        if (charCount > 0) {
          charCount -= 1;
          setText(full.slice(0, charCount));
          schedule(DELETE_MS, step);
        } else {
          phase = "pauseEmpty";
          strIndex += 1;
          schedule(PAUSE_EMPTY_MS, step);
        }
        return;
      }

      if (phase === "pauseEmpty") {
        phase = "type";
        step();
      }
    };

    charCount = 0;
    setText("");
    schedule(0, step);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [active, reducedMotion, strings]);

  return text;
}
