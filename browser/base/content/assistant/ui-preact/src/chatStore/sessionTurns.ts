import type { AssistantMessage } from "../types";

export function messagesToPlainSessionTurns(
  messages: AssistantMessage[]
): Array<{ type: "human" | "ai"; content: string }> {
  const out: Array<{ type: "human" | "ai"; content: string }> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") {
      continue;
    }
    const ai = messages[i + 1];
    if (ai?.role === "ai") {
      out.push({ type: "human", content: m.content });
      out.push({ type: "ai", content: ai.content });
      i++;
    }
  }
  return out;
}
