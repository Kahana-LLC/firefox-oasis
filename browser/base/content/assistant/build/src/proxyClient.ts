import { postSigned } from "./awsSignedFetch";

export type WireMsg = { role: "user" | "model"; content: string };

export async function routeRemote(system: string, messages: WireMsg[], options: string[]) {
  return postSigned("route", { system, messages, options });
}

export async function chatRemote(system: string, messages: WireMsg[]) {
  return postSigned("chat", { system, messages });
}
