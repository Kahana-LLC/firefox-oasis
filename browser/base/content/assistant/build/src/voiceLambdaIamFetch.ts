import { Sha256 } from "@aws-crypto/sha256-js";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { SignatureV4 } from "@aws-sdk/signature-v4";

const region = process.env.AWS_REGION ?? "";
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID ?? "";

function cognitoCredentials() {
  if (!region || !identityPoolId) {
    throw new Error(
      "Missing AWS_REGION or COGNITO_IDENTITY_POOL_ID for voice Lambda signing."
    );
  }
  return fromCognitoIdentityPool({
    clientConfig: { region },
    identityPoolId,
  });
}

let signerPromise: Promise<SignatureV4> | null = null;

function getSigner(): Promise<SignatureV4> {
  if (!signerPromise) {
    signerPromise = Promise.resolve(
      new SignatureV4({
        credentials: cognitoCredentials(),
        region,
        service: "lambda",
        sha256: Sha256,
        applyChecksum: false,
      })
    );
  }
  return signerPromise;
}

export async function postVoiceLambdaWithIam(
  endpoint: string,
  body: string,
  jwtAccessToken?: string
): Promise<Response> {
  const url = new URL(
    endpoint.startsWith("http") ? endpoint : `https://${endpoint}`
  );
  const path = url.pathname && url.pathname.length > 0 ? url.pathname : "/";
  const headers: Record<string, string> = {
    host: url.host,
    "content-type": "application/json",
  };
  if (jwtAccessToken) {
    headers["x-oasis-authorization"] = `Bearer ${jwtAccessToken}`;
  }

  const req = new HttpRequest({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? parseInt(url.port, 10) : undefined,
    method: "POST",
    path,
    headers,
    body,
  });

  const signer = await getSigner();
  const signed = await signer.sign(req);
  const portPart =
    signed.port != null && signed.port !== 80 && signed.port !== 443
      ? `:${signed.port}`
      : "";
  const signedUrl = `${signed.protocol}//${signed.hostname}${portPart}${signed.path}`;
  return fetch(signedUrl, {
    method: signed.method,
    headers: signed.headers as HeadersInit,
    body: signed.body,
  });
}
