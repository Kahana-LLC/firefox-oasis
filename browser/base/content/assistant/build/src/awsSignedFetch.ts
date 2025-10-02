// Signs POSTs to a Lambda Function URL with temporary Cognito (guest) creds.
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";

const region = process.env.AWS_REGION!;
const functionUrl = process.env.OASIS_API_BASE!.replace(/\/+$/, "/");
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;

const credentials = fromCognitoIdentityPool({ identityPoolId, clientConfig: { region } });
const signer = new SignatureV4({ service: "lambda", region, credentials, sha256: Sha256 });

export async function postSigned(op: "route" | "chat", payload: Record<string, any>) {
  const url = new URL(functionUrl);
  const body = JSON.stringify({ op, ...payload });

  const req = new HttpRequest({
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname || "/",
    method: "POST",
    headers: { "content-type": "application/json", host: url.hostname },
    body,
  });

  const signed = await signer.sign(req);

  // Browser must not set Host explicitly
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(signed.headers ?? {})) {
    if (k.toLowerCase() !== "host") headers[k] = String(v);
  }

  const res = await fetch(functionUrl, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Lambda ${res.status} ${await res.text()}`);
  return res.json();
}
