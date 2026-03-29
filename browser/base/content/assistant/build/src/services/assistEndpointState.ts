/**
 * Assist API health tracking.
 *
 * Tracks whether the remote Assist endpoint is working. If a call
 * returns 404, the endpoint is marked "unsupported" with a 60-second
 * cooldown before retrying. Prevents wasted API calls to a failing
 * endpoint. Used by supervisorAssist.ts.
 */
export type AssistEndpointCapability = "unknown" | "supported" | "unsupported";

type AssistEndpointEntry = {
  capability: AssistEndpointCapability;
  unsupportedAt: number;
};

const ASSIST_UNSUPPORTED_RETRY_MS = 60_000;
const endpointStates = new Map<string, AssistEndpointEntry>();

function normalizeEndpointKey(endpointKey: string): string {
  return String(endpointKey || "")
    .trim()
    .toLowerCase();
}

function readEntry(endpointKey: string): AssistEndpointEntry {
  const key = normalizeEndpointKey(endpointKey);
  return (
    endpointStates.get(key) || {
      capability: "unknown",
      unsupportedAt: 0,
    }
  );
}

function writeEntry(endpointKey: string, entry: AssistEndpointEntry): void {
  endpointStates.set(normalizeEndpointKey(endpointKey), entry);
}

export function shouldAttemptAssist(
  endpointKey: string,
  now = Date.now()
): boolean {
  const entry = readEntry(endpointKey);
  if (entry.capability !== "unsupported") {
    return true;
  }
  return now - entry.unsupportedAt >= ASSIST_UNSUPPORTED_RETRY_MS;
}

export function markAssistSupported(endpointKey: string): void {
  writeEntry(endpointKey, {
    capability: "supported",
    unsupportedAt: 0,
  });
}

export function markAssistUnsupported(
  endpointKey: string,
  now = Date.now()
): void {
  writeEntry(endpointKey, {
    capability: "unsupported",
    unsupportedAt: now,
  });
}

export function getAssistCapability(
  endpointKey: string
): AssistEndpointCapability {
  return readEntry(endpointKey).capability;
}

export function __resetAssistEndpointStateForTests(): void {
  endpointStates.clear();
}
