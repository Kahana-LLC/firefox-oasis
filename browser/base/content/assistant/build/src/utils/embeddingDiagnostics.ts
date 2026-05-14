export type EmbeddingDiagnosticCode =
  | "backend_csp_blocked"
  | "backend_unavailable"
  | "local_asset_missing"
  | "worker_init_failed"
  | "model_loading_timeout"
  | "unknown";

export type EmbeddingDiagnostic = {
  code: EmbeddingDiagnosticCode;
  fatal: boolean;
  message: string;
  rawMessage: string;
};

type EmbeddingErrorWithMeta = Error & {
  embeddingDiagnosticCode?: EmbeddingDiagnosticCode;
  embeddingFatal?: boolean;
  embeddingUserMessage?: string;
};

const CSP_BLOCK_RE =
  /webassembly\.instantiate\(\)\s+blocked\s+by\s+csp|blocked by page security policy|blocked by csp/i;
const BACKEND_UNAVAILABLE_RE = /no available backend found/i;
const LOCAL_ASSET_MISSING_RE =
  /file was not found locally at|attempted to load a remote file from/i;
const WORKER_INIT_RE =
  /embedding browser failed to initialize|messageManager not available|could not find main browser window/i;
const TIMEOUT_RE = /embedding timed out after/i;

function rawMessageOf(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.toString();
  }
  return String(error ?? "Unknown error");
}

export function diagnoseEmbeddingFailure(error: unknown): EmbeddingDiagnostic {
  if (error instanceof Error) {
    const withMeta = error as EmbeddingErrorWithMeta;
    if (withMeta.embeddingDiagnosticCode) {
      return {
        code: withMeta.embeddingDiagnosticCode,
        fatal: withMeta.embeddingFatal === true,
        message: withMeta.embeddingUserMessage || rawMessageOf(error),
        rawMessage: rawMessageOf(error),
      };
    }
  }

  const rawMessage = rawMessageOf(error).trim() || "Unknown error";

  if (CSP_BLOCK_RE.test(rawMessage)) {
    return {
      code: "backend_csp_blocked",
      fatal: true,
      message:
        "History search is unavailable in this build because the local embedding runtime was blocked by page security policy (CSP).",
      rawMessage,
    };
  }

  if (BACKEND_UNAVAILABLE_RE.test(rawMessage)) {
    return {
      code: "backend_unavailable",
      fatal: true,
      message:
        "History search is unavailable because the local embedding runtime could not start.",
      rawMessage,
    };
  }

  if (LOCAL_ASSET_MISSING_RE.test(rawMessage)) {
    return {
      code: "local_asset_missing",
      fatal: true,
      message:
        "History search is unavailable because the local embedding model files could not be found in the packaged assistant assets.",
      rawMessage,
    };
  }

  if (WORKER_INIT_RE.test(rawMessage)) {
    return {
      code: "worker_init_failed",
      fatal: true,
      message:
        "History search is unavailable because the local embedding worker failed to initialize.",
      rawMessage,
    };
  }

  if (TIMEOUT_RE.test(rawMessage)) {
    return {
      code: "model_loading_timeout",
      fatal: false,
      message:
        "History search is still loading its local embedding model. Please try again in a moment.",
      rawMessage,
    };
  }

  return {
    code: "unknown",
    fatal: false,
    message: `History search failed: ${rawMessage}.`,
    rawMessage,
  };
}

export function createEmbeddingDiagnosticError(
  diagnostic: EmbeddingDiagnostic
): Error {
  const error = new Error(diagnostic.rawMessage || diagnostic.message) as EmbeddingErrorWithMeta;
  error.embeddingDiagnosticCode = diagnostic.code;
  error.embeddingFatal = diagnostic.fatal;
  error.embeddingUserMessage = diagnostic.message;
  return error;
}

export function formatSearchHistoryFailureMessage(error: unknown): string {
  const diagnostic = diagnoseEmbeddingFailure(error);
  if (diagnostic.code === "unknown") {
    return diagnostic.message;
  }
  if (diagnostic.fatal) {
    return `${diagnostic.message} Browser Console logs contain the underlying runtime error.`;
  }
  return diagnostic.message;
}
