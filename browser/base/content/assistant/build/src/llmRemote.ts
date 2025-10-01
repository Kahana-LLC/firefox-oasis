import { BaseMessage } from "@langchain/core/messages";

type WireMsg = { role: "system"|"user"|"model"; content: string };
const toWire = (m: BaseMessage): WireMsg => {
  const t = (m as any)?._getType?.() || m.constructor?.name?.toLowerCase?.();
  const role = t === "human" || t === "humanmessage" ? "user"
             : t === "aimessage" ? "model" : "system";
  const c = (m as any)?.content;
  const content = typeof c === "string" ? c
    : Array.isArray(c) ? c.map((x:any)=> typeof x==="string"?x:(x?.text||"")).join("")
    : String(c ?? "");
  return { role, content };
};

export async function routeRemote(
  apiBase: string,
  token: string | undefined,
  systemPrompt: string,
  messages: BaseMessage[],
  options: string[]
): Promise<{ next: string }> {
  const res = await fetch(apiBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ op: "route", system: systemPrompt, messages: messages.map(toWire), options }),
  });
  if (!res.ok) throw new Error(`routeRemote: ${res.status} ${await res.text()}`);
  return res.json();
}
