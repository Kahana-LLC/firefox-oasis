import { h } from 'preact';

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, r: number, progress: number) {
  if (progress <= 0) {
    return '';
  }

  if (progress >= 100) {
    const start = polarToCartesian(cx, cy, r, 359.999);
    const mid = polarToCartesian(cx, cy, r, 180);
    const end = polarToCartesian(cx, cy, r, 0);
    return [`M ${start.x} ${start.y}`, `A ${r} ${r} 0 1 1 ${mid.x} ${mid.y}`, `A ${r} ${r} 0 1 1 ${end.x} ${end.y}`].join(' ');
  }

  const endAngle = (progress / 100) * 360;
  const start = polarToCartesian(cx, cy, r, 0);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = progress > 50 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export function ProgressRing({ radius, stroke, progress }: { radius: number; stroke: number; progress: number }) {
  const normalizedRadius = radius - stroke / 2;
  const clampedProgress = Math.max(0, Math.min(progress, 100));
  const progressArc = describeArc(radius, radius, normalizedRadius, clampedProgress);

  return (
    <svg height={radius * 2} width={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`} fill="none">
      <circle
        stroke="#E3E8CC"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <path
        stroke="#7A9200"
        fill="transparent"
        strokeWidth={stroke}
        strokeLinecap="butt"
        d={progressArc}
        style={{ transition: 'd 0.35s' }}
      />
    </svg>
  );
}
