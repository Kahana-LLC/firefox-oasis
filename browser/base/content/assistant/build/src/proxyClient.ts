import { postSigned } from "./awsSignedFetch";
import SupabaseAuth from "./services/supabase";

export type WireMsg = { role: "user" | "model"; content: string };

const supabaseAuth = SupabaseAuth.getInstance();

async function checkAuthentication(): Promise<boolean> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Authentication required: Please sign in to use the AI assistant");
  }
  return true;
}

export async function routeRemote(system: string, messages: WireMsg[], options: string[]) {
  await checkAuthentication();
  return postSigned("route", { system, messages, options });
}

export async function chatRemote(system: string, messages: WireMsg[]) {
  await checkAuthentication();
  return postSigned("chat", { system, messages });
}
