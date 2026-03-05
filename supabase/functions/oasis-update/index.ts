import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const RING_ALLOWLIST = new Set(["oasis-canary", "oasis-stable"]);
const EMPTY_UPDATES_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<updates/>`;

type ArtifactRow = {
  product: string;
  version: string;
  build_id: string;
  build_target: string;
  locale: string | null;
  mar_url: string;
  mar_size: number;
  hash_function: string;
  hash_value: string;
  app_version: string;
  display_version: string;
  platform_version: string;
};

type RingPointerRow = {
  ring: string;
  target_version: string;
  updated_at: string;
  updated_by: string;
  reason: string;
};

type RingAuditRow = {
  id: number;
  ring: string;
  old_version: string | null;
  new_version: string;
  actor: string;
  reason: string;
  changed_at: string;
};

function createDbClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function xmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function parseVersion(value: string): {
  nums: number[];
  pre: "a" | "b" | "rc" | null;
  preNum: number;
} {
  const cleaned = value.trim().toLowerCase().replace("esr", "");
  const match = cleaned.match(/^(\d+(?:\.\d+)*)(?:(a|b|rc)(\d+))?$/);
  if (match) {
    return {
      nums: match[1].split(".").map(part => Number.parseInt(part, 10)),
      pre: (match[2] as "a" | "b" | "rc" | undefined) ?? null,
      preNum: match[3] ? Number.parseInt(match[3], 10) : 0,
    };
  }
  const nums = Array.from(cleaned.matchAll(/\d+/g)).map(m =>
    Number.parseInt(m[0], 10)
  );
  return { nums, pre: null, preNum: 0 };
}

function compareVersions(left: string, right: string): number {
  const l = parseVersion(left);
  const r = parseVersion(right);
  const max = Math.max(l.nums.length, r.nums.length);
  for (let i = 0; i < max; i += 1) {
    const ln = l.nums[i] ?? 0;
    const rn = r.nums[i] ?? 0;
    if (ln !== rn) {
      return ln > rn ? 1 : -1;
    }
  }
  const rank = new Map<"a" | "b" | "rc" | null, number>([
    ["a", 0],
    ["b", 1],
    ["rc", 2],
    [null, 3],
  ]);
  const lr = rank.get(l.pre) ?? 3;
  const rr = rank.get(r.pre) ?? 3;
  if (lr !== rr) {
    return lr > rr ? 1 : -1;
  }
  if (l.preNum === r.preNum) {
    return 0;
  }
  return l.preNum > r.preNum ? 1 : -1;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildUpdateXml(artifact: ArtifactRow): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<updates><update type="minor" displayVersion="${xmlEscape(artifact.display_version)}" appVersion="${xmlEscape(artifact.app_version)}" platformVersion="${xmlEscape(artifact.platform_version)}" buildID="${xmlEscape(artifact.build_id)}"><patch type="complete" URL="${xmlEscape(artifact.mar_url)}" size="${artifact.mar_size}" hashFunction="${xmlEscape(artifact.hash_function)}" hashValue="${xmlEscape(artifact.hash_value)}" /></update></updates>`;
}

function normalizeLocale(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const locale = String(value).trim();
  if (!locale || locale === "*") {
    return null;
  }
  return locale;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeRequestPath(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length >= 3 &&
    segments[0] === "functions" &&
    segments[1] === "v1"
  ) {
    return `/${segments.slice(3).join("/")}`;
  }
  if (segments[0] === "oasis-update") {
    return `/${segments.slice(1).join("/")}`;
  }
  return url.pathname;
}

function secureCompare(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let delta = 0;
  for (let i = 0; i < left.length; i += 1) {
    delta |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return delta === 0;
}

function checkAdminAuth(req: Request): { ok: boolean; status: number; error: string } {
  const expected = Deno.env.get("OASIS_ADMIN_TOKEN");
  if (!expected) {
    return { ok: false, status: 500, error: "OASIS_ADMIN_TOKEN is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "missing bearer token" };
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!secureCompare(token, expected)) {
    return { ok: false, status: 401, error: "invalid bearer token" };
  }
  return { ok: true, status: 200, error: "" };
}

async function getArtifact(
  client: SupabaseClient,
  product: string,
  version: string,
  buildTarget: string,
  locale: string,
): Promise<ArtifactRow | null> {
  const exact = await client
    .from("artifacts")
    .select(
      "product, version, build_id, build_target, locale, mar_url, mar_size, hash_function, hash_value, app_version, display_version, platform_version",
    )
    .eq("product", product)
    .eq("version", version)
    .eq("build_target", buildTarget)
    .eq("locale", locale)
    .limit(1);
  if (exact.error) {
    throw exact.error;
  }
  if (exact.data && exact.data.length > 0) {
    return exact.data[0] as ArtifactRow;
  }

  const fallback = await client
    .from("artifacts")
    .select(
      "product, version, build_id, build_target, locale, mar_url, mar_size, hash_function, hash_value, app_version, display_version, platform_version",
    )
    .eq("product", product)
    .eq("version", version)
    .eq("build_target", buildTarget)
    .is("locale", null)
    .limit(1);
  if (fallback.error) {
    throw fallback.error;
  }
  if (!fallback.data || fallback.data.length === 0) {
    return null;
  }
  return fallback.data[0] as ArtifactRow;
}

function artifactPayloadIsEquivalent(
  existing: ArtifactRow,
  payload: Record<string, unknown>,
  displayVersion: string,
  appVersion: string,
  platformVersion: string,
  locale: string | null,
): boolean {
  return (
    existing.product === String(payload.product) &&
    existing.version === String(payload.version) &&
    existing.build_id === String(payload.build_id) &&
    existing.build_target === String(payload.build_target) &&
    (existing.locale ?? null) === locale &&
    existing.mar_url === String(payload.mar_url) &&
    Number(existing.mar_size) === Number(payload.mar_size) &&
    existing.hash_function === String(payload.hash_function) &&
    existing.hash_value === String(payload.hash_value) &&
    existing.display_version === displayVersion &&
    existing.app_version === appVersion &&
    existing.platform_version === platformVersion
  );
}

async function handleUpdate(client: SupabaseClient, path: string): Promise<Response> {
  const segments = path.split("/").filter(Boolean);
  if (
    segments.length !== 13 ||
    segments[0] !== "update" ||
    segments[1] !== "6" ||
    segments[12] !== "update.xml"
  ) {
    return xmlResponse(200, EMPTY_UPDATES_XML);
  }

  const [
    product,
    version,
    _buildId,
    buildTarget,
    locale,
    channel,
    _osVersion,
    _systemCapabilities,
    _distribution,
    _distributionVersion,
  ] = segments.slice(2, 12).map(decodeSegment);

  if (!RING_ALLOWLIST.has(channel)) {
    return xmlResponse(200, EMPTY_UPDATES_XML);
  }

  const ring = await client
    .from("ring_pointers")
    .select("target_version")
    .eq("ring", channel)
    .limit(1)
    .maybeSingle();
  if (ring.error) {
    throw ring.error;
  }
  if (!ring.data) {
    return xmlResponse(200, EMPTY_UPDATES_XML);
  }
  if (compareVersions(ring.data.target_version, version) <= 0) {
    return xmlResponse(200, EMPTY_UPDATES_XML);
  }

  const artifact = await getArtifact(
    client,
    product,
    ring.data.target_version,
    buildTarget,
    locale,
  );
  if (!artifact) {
    return xmlResponse(200, EMPTY_UPDATES_XML);
  }

  return xmlResponse(200, buildUpdateXml(artifact));
}

async function handlePostArtifact(client: SupabaseClient, req: Request): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const required = [
    "product",
    "version",
    "build_id",
    "build_target",
    "mar_url",
    "mar_size",
    "hash_function",
    "hash_value",
  ];
  const missing = required.filter(field => !payload[field]);
  if (missing.length > 0) {
    return jsonResponse(400, { error: `Missing fields: ${missing.join(", ")}` });
  }

  const version = String(payload.version).trim();
  const marUrl = String(payload.mar_url).trim();
  if (!marUrl.includes(version)) {
    return jsonResponse(400, { error: "mar_url must include the version string" });
  }

  const locale = normalizeLocale(payload.locale);
  const displayVersion = String(payload.display_version ?? version);
  const appVersion = String(payload.app_version ?? version);
  const platformVersion = String(payload.platform_version ?? version);

  let existingQuery = client
    .from("artifacts")
    .select(
      "product, version, build_id, build_target, locale, mar_url, mar_size, hash_function, hash_value, app_version, display_version, platform_version",
    )
    .eq("product", String(payload.product))
    .eq("version", version)
    .eq("build_target", String(payload.build_target))
    .limit(1);
  existingQuery = locale === null
    ? existingQuery.is("locale", null)
    : existingQuery.eq("locale", locale);
  const existingResult = await existingQuery.maybeSingle();
  if (existingResult.error) {
    throw existingResult.error;
  }

  if (existingResult.data) {
    const existing = existingResult.data as ArtifactRow;
    if (
      !artifactPayloadIsEquivalent(
        existing,
        payload,
        displayVersion,
        appVersion,
        platformVersion,
        locale,
      )
    ) {
      return jsonResponse(409, { error: "Artifact already exists and is immutable" });
    }
    return jsonResponse(200, { status: "ok", artifact: existing });
  }

  const insert = await client
    .from("artifacts")
    .insert({
      product: String(payload.product),
      version,
      build_id: String(payload.build_id),
      build_target: String(payload.build_target),
      locale,
      mar_url: marUrl,
      mar_size: Number(payload.mar_size),
      hash_function: String(payload.hash_function),
      hash_value: String(payload.hash_value),
      display_version: displayVersion,
      app_version: appVersion,
      platform_version: platformVersion,
    })
    .select(
      "product, version, build_id, build_target, locale, mar_url, mar_size, hash_function, hash_value, app_version, display_version, platform_version",
    )
    .limit(1)
    .single();
  if (insert.error) {
    throw insert.error;
  }

  return jsonResponse(200, { status: "ok", artifact: insert.data });
}

async function handleListRings(client: SupabaseClient): Promise<Response> {
  const rows = await client
    .from("ring_pointers")
    .select("ring, target_version, updated_at, updated_by, reason")
    .order("ring", { ascending: true });
  if (rows.error) {
    throw rows.error;
  }
  return jsonResponse(200, { rings: rows.data ?? [] });
}

async function handleGetRing(client: SupabaseClient, ring: string): Promise<Response> {
  if (!RING_ALLOWLIST.has(ring)) {
    return jsonResponse(400, { error: "ring not allowed" });
  }
  const row = await client
    .from("ring_pointers")
    .select("ring, target_version, updated_at, updated_by, reason")
    .eq("ring", ring)
    .limit(1)
    .maybeSingle();
  if (row.error) {
    throw row.error;
  }
  if (!row.data) {
    return jsonResponse(404, { error: "ring not set" });
  }
  return jsonResponse(200, row.data as RingPointerRow);
}

async function handleGetRingAudit(client: SupabaseClient, ring: string): Promise<Response> {
  if (!RING_ALLOWLIST.has(ring)) {
    return jsonResponse(400, { error: "ring not allowed" });
  }
  const rows = await client
    .from("ring_audit")
    .select("id, ring, old_version, new_version, actor, reason, changed_at")
    .eq("ring", ring)
    .order("id", { ascending: false })
    .limit(200);
  if (rows.error) {
    throw rows.error;
  }
  return jsonResponse(200, { audit: (rows.data ?? []) as RingAuditRow[] });
}

async function handleSetRing(
  client: SupabaseClient,
  ring: string,
  req: Request,
): Promise<Response> {
  if (!RING_ALLOWLIST.has(ring)) {
    return jsonResponse(400, { error: "ring not allowed" });
  }
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const targetVersion = payload.target_version ? String(payload.target_version) : "";
  const actor = payload.actor ? String(payload.actor) : "";
  const reason = payload.reason ? String(payload.reason) : "";
  if (!targetVersion || !actor || !reason) {
    return jsonResponse(400, {
      error: "target_version, actor, and reason are required",
    });
  }

  const result = await client.rpc("set_ring_pointer", {
    p_ring: ring,
    p_target_version: targetVersion,
    p_actor: actor,
    p_reason: reason,
  });
  if (result.error) {
    throw result.error;
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) {
    throw new Error("set_ring_pointer returned no rows");
  }

  return jsonResponse(200, {
    status: "ok",
    ring,
    old_version: row.old_version ?? null,
    new_version: row.new_version ?? targetVersion,
    updated_at: row.updated_at,
  });
}

Deno.serve(async req => {
  try {
    const url = new URL(req.url);
    const path = normalizeRequestPath(url);
    const db = createDbClient();

    if (req.method === "GET" && path.startsWith("/update/6/") && path.endsWith("/update.xml")) {
      return await handleUpdate(db, path);
    }

    if (path.startsWith("/admin/")) {
      const auth = checkAdminAuth(req);
      if (!auth.ok) {
        return jsonResponse(auth.status, { error: auth.error });
      }

      if (req.method === "GET" && path === "/admin/rings") {
        return await handleListRings(db);
      }

      if (req.method === "POST" && path === "/admin/artifacts") {
        return await handlePostArtifact(db, req);
      }

      if (path.startsWith("/admin/rings/")) {
        const ringPath = path.slice("/admin/rings/".length);
        if (ringPath.endsWith("/audit")) {
          const ring = ringPath.slice(0, -"/audit".length).replace(/\/+$/, "");
          if (req.method !== "GET") {
            return jsonResponse(404, { error: "not found" });
          }
          return await handleGetRingAudit(db, ring);
        }
        const ring = ringPath.replace(/\/+$/, "");
        if (req.method === "GET") {
          return await handleGetRing(db, ring);
        }
        if (req.method === "POST") {
          return await handleSetRing(db, ring, req);
        }
      }
    }

    return jsonResponse(404, { error: "not found" });
  } catch (error) {
    console.error("oasis-update error", error);
    return jsonResponse(500, { error: "internal error" });
  }
});
