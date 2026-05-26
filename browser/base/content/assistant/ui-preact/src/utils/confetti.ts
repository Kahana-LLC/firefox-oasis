type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  r: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  max: number;
  shape: "rect" | "dot";
};

const RAINBOW_HUES = [
  "#e11d48",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
];

const FALLBACK_ACCENT = "#7a9200";
const FALLBACK_SOFT = "#e8f0c8";

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map(c => c + c)
          .join("")
      : normalized;
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  weightB: number
): string {
  const w = Math.max(0, Math.min(1, weightB));
  return toHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w
  );
}

function buildShadesFromAccent(accent: string, soft: string): string[] {
  const accentRgb = parseHexColor(accent);
  const softRgb = parseHexColor(soft);
  if (!accentRgb) {
    return [accent, FALLBACK_SOFT, "#94a82e", "#5a7000"];
  }
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const shades = [
    accent,
    softRgb ? toHex(softRgb.r, softRgb.g, softRgb.b) : mixRgb(accentRgb, white, 0.55),
    mixRgb(accentRgb, white, 0.35),
    mixRgb(accentRgb, black, 0.22),
    mixRgb(accentRgb, black, 0.38),
  ];
  return [...new Set(shades)];
}

export function getTrainingConfettiPalette(): string[] {
  if (typeof document === "undefined") {
    return [...buildShadesFromAccent(FALLBACK_ACCENT, FALLBACK_SOFT), ...RAINBOW_HUES];
  }
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const accent =
    styles.getPropertyValue("--primary-green").trim() || FALLBACK_ACCENT;
  const soft = styles.getPropertyValue("--primary-50").trim() || FALLBACK_SOFT;
  return [...buildShadesFromAccent(accent, soft), ...RAINBOW_HUES];
}

export function playTrainingConfetti(colors?: string[]): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }
  const motionMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (motionMq?.matches) {
    return;
  }

  const palette = colors?.length ? colors : getTrainingConfettiPalette();

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:20001;width:100%;height:100%";
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  const draw = context;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  draw.scale(dpr, dpr);

  const particles: Particle[] = [];
  const burst = (
    count: number,
    cx: number,
    cy: number,
    spread: number,
    speedMin: number,
    speedMax: number
  ) => {
    for (let i = 0; i < count; i++) {
      const a = (Math.random() - 0.5) * spread - Math.PI / 2;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      particles.push({
        x: cx + (Math.random() - 0.5) * 70,
        y: cy + (Math.random() - 0.5) * 22,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 0.26 + Math.random() * 0.24,
        r: 2 + Math.random() * 4.4,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.42,
        color: palette[(Math.random() * palette.length) | 0]!,
        life: 0,
        max: 62 + Math.random() * 55,
        shape: Math.random() < 0.35 ? "dot" : "rect",
      });
    }
  };

  burst(105, w / 2, h * 0.72, Math.PI * 1.15, 4.4, 13.4);
  setTimeout(() => {
    burst(72, w / 2, h * 0.57, Math.PI * 1.45, 3.2, 10.2);
  }, 190);

  let start = 0;
  const maxMs = 2150;

  function frame(ts: number) {
    if (!start) {
      start = ts;
    }
    const elapsed = ts - start;
    draw.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of particles) {
      if (p.life >= p.max) {
        continue;
      }
      alive = true;
      p.life += 1;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const alpha = 1 - p.life / p.max;
      draw.save();
      draw.globalAlpha = Math.max(0, alpha * 0.95);
      draw.translate(p.x, p.y);
      draw.rotate(p.rot);
      draw.fillStyle = p.color;
      if (p.shape === "dot") {
        draw.beginPath();
        draw.arc(0, 0, p.r * 0.48, 0, Math.PI * 2);
        draw.fill();
      } else {
        draw.fillRect(-p.r * 0.65, -p.r * 0.25, p.r * 1.3, p.r * 0.5);
      }
      draw.restore();
    }
    if (alive && elapsed < maxMs) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}
