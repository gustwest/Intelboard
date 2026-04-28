'use client';

type Point = { period: string; value: number | null };
type Series = {
  customer_id: string;
  customer_name: string;
  customer_slug?: string;
  points: Point[];
};

type Props = {
  periods: string[];
  series: Series[];
  height?: number;
  unit?: string;
};

const PALETTE = ['var(--brand-accent)', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7'];
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.5)';
const DIM = 'rgba(255,255,255,0.25)';

export default function TrendChart({ periods, series, height = 240, unit = '' }: Props) {
  const W = 720;
  const H = height;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  if (periods.length === 0 || series.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>
        Ingen tidsserie att visa. Kontrollera att datumfältet finns i datasetet och att granulariteten matchar datan.
      </div>
    );
  }

  const allValues: number[] = [];
  for (const s of series) for (const p of s.points) {
    if (typeof p.value === 'number' && !Number.isNaN(p.value)) allValues.push(p.value);
  }
  const vMin = allValues.length ? Math.min(...allValues, 0) : 0;
  const vMax = allValues.length ? Math.max(...allValues, 1) : 1;
  const span = vMax - vMin || 1;

  const x = (i: number) => PAD_L + (periods.length === 1 ? innerW / 2 : (i / (periods.length - 1)) * innerW);
  const y = (v: number) => PAD_T + innerH - ((v - vMin) / span) * innerH;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => vMin + (span * i) / yTicks);

  const fmtNum = (n: number) => {
    if (Math.abs(n) >= 10000) return n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });
    return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
  };

  // Skip x-axis labels if too dense
  const labelEvery = Math.max(1, Math.ceil(periods.length / 8));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: H }}>
        {/* Y grid + labels */}
        {tickValues.map((tv, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={y(tv)} x2={W - PAD_R} y2={y(tv)} stroke={BORDER} strokeWidth={1} />
            <text x={PAD_L - 6} y={y(tv) + 3} textAnchor="end" fontSize="10" fill={DIM}>{fmtNum(tv)}{unit}</text>
          </g>
        ))}

        {/* X labels */}
        {periods.map((p, i) => (
          i % labelEvery === 0 ? (
            <text key={p} x={x(i)} y={H - 12} textAnchor="middle" fontSize="10" fill={DIM}>
              {p}
            </text>
          ) : null
        ))}

        {/* Series */}
        {series.map((s, sIdx) => {
          const color = PALETTE[sIdx % PALETTE.length];
          // Build a polyline; periods that have no point are gaps (we just skip them)
          const periodToPoint = new Map(s.points.map(p => [p.period, p]));
          const segments: { i: number; v: number }[] = [];
          periods.forEach((p, i) => {
            const pt = periodToPoint.get(p);
            if (pt && typeof pt.value === 'number' && !Number.isNaN(pt.value)) {
              segments.push({ i, v: pt.value });
            }
          });
          const path = segments.map((s2, k) => `${k === 0 ? 'M' : 'L'}${x(s2.i).toFixed(1)},${y(s2.v).toFixed(1)}`).join(' ');
          return (
            <g key={s.customer_id}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {segments.map((s2) => (
                <circle key={s2.i} cx={x(s2.i)} cy={y(s2.v)} r={3} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, paddingLeft: PAD_L, fontSize: 11 }}>
        {series.map((s, sIdx) => (
          <div key={s.customer_id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: MUTED }}>
            <span style={{ width: 10, height: 2, background: PALETTE[sIdx % PALETTE.length], display: 'inline-block' }} />
            {s.customer_name}
          </div>
        ))}
      </div>
    </div>
  );
}
