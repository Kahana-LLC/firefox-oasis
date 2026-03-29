import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { OasisWindow, VoiceAgentEvent, VoiceAgentState } from '../types';

type Props = {
  agent: NonNullable<OasisWindow['voiceAgent']>;
  agentState: VoiceAgentState;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function VoiceAuraVisualizer({ agent, agentState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const micRef = useRef(0);
  const ttsRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const unsub = agent.on((event: VoiceAgentEvent) => {
      if (event.type === "audio_level") {
        micRef.current = event.mic;
        ttsRef.current = event.tts;
      }
    });
    return unsub;
  }, [agent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : 320;
      const h = 200;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(resize);
      if (canvas.parentElement) ro.observe(canvas.parentElement);
    } catch {
      resize();
    }

    const draw = (t: number) => {
      timeRef.current = t * 0.001;
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || 200;
      ctx.clearRect(0, 0, w, h);

      const breathe =
        agentState === "thinking" || agentState === "transcribing"
          ? 0.22 + Math.sin(t * 0.0022) * 0.08
          : agentState === "idle"
            ? 0.08 + Math.sin(t * 0.0015) * 0.04
            : 0;

      const mic = clamp01(micRef.current + breathe * 0.35);
      const tts = clamp01(ttsRef.current);
      const energy = Math.max(mic, tts, breathe);

      const cx = w * 0.5;
      const baseY = h * 0.42;
      const spread = w * 0.38;
      const amp = 12 + energy * 55;

      const layers = [
        { phase: 0, alpha: 0.45, w: 2.2 },
        { phase: 0.4, alpha: 0.65, w: 1.8 },
        { phase: -0.35, alpha: 0.85, w: 1.4 },
      ];

      for (const layer of layers) {
        const ph = timeRef.current * 1.2 + layer.phase;
        ctx.save();
        ctx.lineWidth = layer.w;
        ctx.lineCap = "round";
        ctx.shadowBlur = 18 + energy * 28;
        ctx.shadowColor =
          agentState === "speaking"
            ? `rgba(160, 200, 255, ${0.35 + tts * 0.45})`
            : `rgba(140, 200, 90, ${0.35 + mic * 0.45})`;
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, `rgba(80, 220, 160, ${layer.alpha})`);
        g.addColorStop(0.45, `rgba(100, 180, 255, ${layer.alpha})`);
        g.addColorStop(1, `rgba(220, 120, 255, ${layer.alpha})`);
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.75 + energy * 0.2;
        ctx.beginPath();
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const x = cx - spread + u * spread * 2;
          const wave =
            Math.sin(u * Math.PI + ph) * amp * (0.35 + 0.65 * energy) +
            Math.sin(u * Math.PI * 3 + ph * 2) * (3 + energy * 12) * layer.alpha;
          const y = baseY + wave + Math.sin(ph + u * 4) * energy * 6;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [agentState, agent]);

  return (
    <div className="voice-aura-wrap">
      <canvas ref={canvasRef} className="voice-aura-canvas" aria-hidden />
    </div>
  );
}
