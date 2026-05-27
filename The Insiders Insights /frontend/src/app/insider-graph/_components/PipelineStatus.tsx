'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

export type PipelineStep = {
  key: string;
  label: string;
  state: 'done' | 'attention' | 'todo';
  detail?: string | null;
  at?: string | null;
};

type PipelineData = { steps: PipelineStep[]; next_action: string | null; pending: number };

const STATE_COLOR: Record<PipelineStep['state'], string> = {
  done: '#22c55e',
  attention: '#f59e0b',
  todo: C.dim,
};

function fmt(at?: string | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('sv-SE');
}

/**
 * Pipeline-stege för en kund. Antingen `steps` direkt (kundlistan räknar fram en
 * kompakt variant klient-sidan), eller `clientId` → hämtar /api/clients/{id}/pipeline.
 */
export default function PipelineStatus({
  clientId,
  steps: stepsProp,
  compact = false,
  caption,
}: {
  clientId?: string;
  steps?: PipelineStep[];
  compact?: boolean;
  caption?: string;
}) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (stepsProp || !clientId) return;
    let cancelled = false;
    graphFetch<PipelineData>(`/api/clients/${clientId}/pipeline`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [clientId, stepsProp]);

  const steps = stepsProp ?? data?.steps;
  const nextAction = data?.next_action ?? null;

  if (!steps) {
    if (error) return null; // tyst degradering om endpointen inte finns ännu
    return compact ? null : (
      <div style={{ fontSize: 12, color: C.muted, padding: '8px 0' }}>Laddar status…</div>
    );
  }

  // Kompakt: rad av prickar + en kort statustext. Används i kundkorten.
  if (compact) {
    const hasAttention = steps.some((s) => s.state === 'attention');
    const autoNext = nextAction ?? steps.find((s) => s.state !== 'done')?.label ?? null;
    const text = caption ?? (autoNext ? `Nästa: ${autoNext}` : 'Allt klart');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {steps.map((s) => (
            <span
              key={s.key}
              title={`${s.label}${s.detail ? ` — ${s.detail}` : ''}`}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: s.state === 'todo' ? 'transparent' : STATE_COLOR[s.state],
                border: s.state === 'todo' ? `1.5px solid ${C.dim}` : 'none',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 11, color: hasAttention ? '#d97706' : '#16a34a', fontWeight: 600 }}>
          {text}
        </span>
      </div>
    );
  }

  // Full: horisontell stege med prickar, etiketter och detalj/tid.
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {steps.map((s, i) => {
        const color = STATE_COLOR[s.state];
        const sub = s.detail || fmt(s.at);
        const prevDone = i > 0 && steps[i - 1].state === 'done';
        return (
          <div
            key={s.key}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: 0 }}
          >
            {i > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 0,
                  width: '50%',
                  height: 2,
                  background: prevDone ? STATE_COLOR.done : C.border,
                }}
              />
            )}
            {i < steps.length - 1 && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  width: '50%',
                  height: 2,
                  background: s.state === 'done' ? STATE_COLOR.done : C.border,
                }}
              />
            )}
            <span
              style={{
                position: 'relative',
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: s.state === 'todo' ? C.card : color,
                border: s.state === 'todo' ? `2px solid ${C.dim}` : `2px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              {s.state === 'done' && <Check size={11} color="#fff" strokeWidth={3} />}
              {s.state === 'attention' && (
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>!</span>
              )}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.text, marginTop: 8, textAlign: 'center' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 10, color: s.state === 'attention' ? '#d97706' : C.muted, marginTop: 2, textAlign: 'center', minHeight: 12 }}>
              {sub || ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
