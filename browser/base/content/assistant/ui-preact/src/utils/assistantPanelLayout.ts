export type AssistantFixedPanelLayout = {
  top: number;
  right: number;
  width: number;
  maxHeight: string;
  transform?: string;
};

export type LayoutFixedPanelBelowTriggerOptions = {
  edge?: number;
  gapBelowTrigger?: number;
  minWidth?: number;
  maxWidth?: number;
  maxHeight: string;
  maxHeightPxCap?: number;
  minHeightPxFloor?: number;
};

export function layoutKeyForPanel(layout: AssistantFixedPanelLayout): string {
  return `${layout.top}|${layout.right}|${layout.width}|${layout.transform ?? ""}|${layout.maxHeight}`;
}

export function layoutFixedPanelBelowTrigger(
  wrap: HTMLElement | null,
  trigger: HTMLElement | null,
  options: LayoutFixedPanelBelowTriggerOptions
): AssistantFixedPanelLayout | null {
  if (!wrap || !trigger) {
    return null;
  }
  const container = wrap.closest(".assistant-container");
  if (!container) {
    return null;
  }
  const edge = options.edge ?? 8;
  const gap = options.gapBelowTrigger ?? 6;
  const minW = options.minWidth ?? 160;
  const maxW = options.maxWidth ?? 280;
  const cr = container.getBoundingClientRect();
  const tr = trigger.getBoundingClientRect();
  const width = Math.max(
    minW,
    Math.min(maxW, Math.floor(cr.width - edge * 2))
  );
  const right = Math.round(window.innerWidth - cr.right + edge);
  const top = Math.round(tr.bottom + gap);
  const innerW = window.innerWidth;
  const leftEdge = innerW - right - width;
  const minLeft = cr.left + edge;
  const translateX =
    leftEdge < minLeft ? Math.round(minLeft - leftEdge) : 0;
  const transform = translateX
    ? `translateX(${translateX}px)`
    : undefined;

  let maxHeight = options.maxHeight;
  if (options.maxHeightPxCap != null) {
    const floor = options.minHeightPxFloor ?? 120;
    const bottomSpace = window.innerHeight - top - edge;
    const px = Math.max(
      floor,
      Math.min(options.maxHeightPxCap, Math.floor(bottomSpace))
    );
    maxHeight = `${px}px`;
  }

  return {
    top,
    right,
    width,
    maxHeight,
    transform,
  };
}
