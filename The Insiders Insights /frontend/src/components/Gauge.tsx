'use client';

type Thresholds = { red?: number; yellow?: number; green?: number };

type Props = {
  value: number | null | undefined;
  thresholds?: Thresholds;
  inverted?: boolean;  // lower = better when true
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
};

const ACCENT = '#a855f7';
const RED = '#ef4444';
const YELLOW = '#f59e0b';
const GREEN = '#22c55e';
const MUTED = 'rgba(255,255,255,0.3)';

function bandColor(v: number, t: Thresholds, inverted: boolean): string {
  const hasAll = typeof t.red === 'number' && typeof t.yellow === 'number' && typeof t.green === 'number';
  if (!hasAll) return ACCENT;
  if (inverted) {
    if (v <= t.green!) return GREEN;
    if (v <= t.yellow!) return YELLOW;
    if (v <= t.red!) return RED;
    return RED;
  }
  if (v >= t.green!) return GREEN;
  if (v >= t.yellow!) return YELLOW;
  if (v >= t.red!) return RED;
  return RED;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Gauge({ value, thresholds = {}, inverted = false, unit = '', size = 'md', label }: Props) {
  const v = typeof value === 'number' ? value : 0;
  const color = bandColor(v, thresholds, inverted);

  const sizeMap = { sm: 120, md: 180, lg: 240 };
  const W = sizeMap[size];
  const H = Math.round(W * 0.62);

  // determine range from thresholds
  const hasAll = typeof thresholds.red === 'number' && typeof thresholds.yellow === 'number' && typeof thresholds.green === 'number';
  const sorted = hasAll ? [thresholds.red!, thresholds.yellow!, thresholds.green!].sort((a, b) => a - b) : [];
  const domainMin = hasAll ? Math.min(sorted[0], v) : 0;
  const domainMax = hasAll ? Math.max(sorted[sorted.length - 1], v) : Math.max(v, 1);
  const range = Math.max(0.0001, domainMax - domainMin);
  const pct = Math.max(0, Math.min(1, (v - domainMin) / range));

  // Arc params
  const cx = W / 2;
  const cy = H - 8;
  const r = W / 2 - 14;
  const start = Math.PI; // 180°
  const end = 0;         // 0°

  function arcPath(from: number, to: number) {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(-from + Math.PI * 2) * -1; // flip y
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(-to + Math.PI * 2) * -1;
    const large = from - to > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  // build band segments in order
  const segments: { from: number; to: number; color: string }[] = [];
  if (hasAll) {
    const pts = [
      { v: sorted[0], color: inverted ? GREEN : RED },
      { v: sorted[1], color: YELLOW },
      { v: sorted[2], color: inverted ? RED : GREEN },
    ];
    let prev = start;
    for (const p of pts) {
      const pFrac = (p.v - domainMin) / range;
      const angle = start + (end - start) * pFrac;
      segments.push({ from: prev, to: angle, color: p.color });
      prev = angle;
    }
    // final segment (to end of arc)
    segments.push({ from: prev, to: end, color: inverted ? RED : GREEN });
  } else {
    segments.push({ from: start, to: end, color: 'rgba(168,85,247,0.25)' });
  }

  const needleAngle = start + (end - start) * pct;
  const nx = cx + (r - 8) * Math.cos(needleAngle);
  const ny = cy + (r - 8) * Math.sin(-needleAngle + Math.PI * 2) * -1;

  return (
    <div style={{ textAlign: 'center', width: W }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {segments.map((s, i) => (
          <path key={i} d={arcPath(s.from, s.to)} stroke={s.color} strokeOpacity={0.75} strokeWidth={10} fill="none" strokeLinecap="round" />
        ))}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill={color} />
      </svg>
      <div style={{ marginTop: -6 }}>
        <div style={{ fontSize: size === 'sm' ? 20 : size === 'md' ? 28 : 36, fontWeight: 800, color, fontFamily: 'monospace' }}>
          {fmt(v)}{unit && <span style={{ fontSize: '0.55em', color: MUTED, marginLeft: 4 }}>{unit}</span>}
        </div>
        {label && <div style={{ fontSize: 11, color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>}
      </div>
    </div>
  );
}
