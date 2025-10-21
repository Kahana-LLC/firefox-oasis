// Signs POSTs to a Lambda Function URL with Supabase JWT
import SupabaseAuth from "./services/supabase";

const functionUrl = process.env.OASIS_API_BASE!.replace(/\/+$/, "/");
const supabaseAuth = SupabaseAuth.getInstance();

export async function postSigned(op: "route" | "chat", payload: Record<string, any>) {
  const url = new URL(functionUrl);
  const body = JSON.stringify({ op, ...payload });

  const session = await supabaseAuth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("Authentication required: No JWT found");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(functionUrl, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Lambda ${res.status} ${await res.text()}`);
  return res.json();
}
