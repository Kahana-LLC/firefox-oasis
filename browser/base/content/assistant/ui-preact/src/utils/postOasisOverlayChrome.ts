export function isOasisAssistantOverlayLayout(): boolean {
  const bridge = (
    window as Window & {
      assistantBridge?: { isOasisAssistantOverlayLayout?: () => boolean };
    }
  ).assistantBridge;
  try {
    return bridge?.isOasisAssistantOverlayLayout?.() === true;
  } catch {
    return false;
  }
}

export function postOasisOverlayChromeMessage(
  data: Record<string, unknown>
): void {
  const bridge = (
    window as Window & {
      assistantBridge?: {
        postOasisOverlayChromeMessage?: (d: Record<string, unknown>) => boolean;
      };
    }
  ).assistantBridge;
  try {
    if (
      typeof bridge?.postOasisOverlayChromeMessage === "function" &&
      bridge.postOasisOverlayChromeMessage(data)
    ) {
      return;
    }
  } catch {
    // fall through
  }
  try {
    window.parent.postMessage(data, "*");
  } catch {
    // ignore
  }
}

export function runOasisAssistantLayoutToggle(): boolean {
  const bridge = (
    window as Window & {
      assistantBridge?: { runOasisAssistantLayoutToggle?: () => boolean };
    }
  ).assistantBridge;
  try {
    return (
      typeof bridge?.runOasisAssistantLayoutToggle === "function" &&
      bridge.runOasisAssistantLayoutToggle()
    );
  } catch {
    return false;
  }
}
