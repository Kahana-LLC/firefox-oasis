const DEBUG_PREF_NAME = "browser.oasis.assistant.debug";

type LogScope = string;
type LogMeta = unknown;

type LoggerHost = {
  window?: {
    Services?: {
      prefs?: {
        getBoolPref?: (name: string, defaultValue?: boolean) => boolean;
      };
    };
  };
  Services?: {
    prefs?: {
      getBoolPref?: (name: string, defaultValue?: boolean) => boolean;
    };
  };
};

function isDebugEnabled(globalRef: typeof globalThis = globalThis): boolean {
  try {
    const host = globalRef as unknown as LoggerHost;
    const prefs =
      host.window?.Services?.prefs ||
      host.Services?.prefs;
    if (!prefs?.getBoolPref) {
      return false;
    }
    return !!prefs.getBoolPref(DEBUG_PREF_NAME, false);
  } catch {
    return false;
  }
}

function formatPrefix(scope: LogScope, message: string): string {
  return `[Assistant:${scope}] ${message}`;
}

function write(
  level: "debug" | "info" | "warn" | "error",
  scope: LogScope,
  message: string,
  meta?: LogMeta
): void {
  if ((level === "debug" || level === "info") && !isDebugEnabled()) {
    return;
  }
  const text = formatPrefix(scope, message);
  if (meta !== undefined) {
    console[level](text, meta);
    return;
  }
  console[level](text);
}

export const assistantLogger = {
  debug(scope: LogScope, message: string, meta?: LogMeta): void {
    write("debug", scope, message, meta);
  },
  info(scope: LogScope, message: string, meta?: LogMeta): void {
    write("info", scope, message, meta);
  },
  warn(scope: LogScope, message: string, meta?: LogMeta): void {
    write("warn", scope, message, meta);
  },
  error(scope: LogScope, message: string, meta?: LogMeta): void {
    write("error", scope, message, meta);
  },
  isDebugEnabled,
};

export { DEBUG_PREF_NAME };
