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

export function playTrainingConfetti(): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }
  const motionMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (motionMq?.matches) {
    return;
  }

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

  const colors = [
    "#7a9200",
    "#94a82e",
    "#5a7000",
    "#c5d49a",
    "#4a5c00",
    "#e8f0c8",
  ];
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
        color: colors[(Math.random() * colors.length) | 0]!,
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
