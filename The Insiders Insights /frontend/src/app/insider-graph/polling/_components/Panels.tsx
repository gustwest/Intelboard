'use client';

import { useState } from 'react';
import { Play, Pause, CalendarClock } from 'lucide-react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { fmtRelative } from '../../_lib/jobRuns';
import { fmtDateTime } from '@/lib/datetime';
import {
  ScheduleRow,
  Finding,
  Trend,
  PollingQuestionsResp,
  ViewMode,
  S,
  PERSONA_SV,
  SEVERITY,
  CATEGORY_SV,
  JOB_LABEL,
  ACTIVITY_FEED_TYPES,
  cardStyle,
  rowGrid,
  isStale,
  summaryBlurb,
  harmLabel,
} from '../_shared';
import { SectionHead } from './common';

export function SchedulesPanel({ rows, onToggle }: { rows: ScheduleRow[]; onToggle: (name: string, paused: boolean) => void }) {
  const fmt = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : fmtDateTime(d, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Schemalagda körningar"
        hint="Mätloopens automatik. Pausa stoppar Cloud Scheduler-triggern tills den återupptas — körningar uteblir helt under tiden."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const missing = r.exists === false;
          const paused = !!r.paused;
          const pill = missing
            ? { text: 'Saknas', color: C.dim, bg: 'rgba(106,126,138,0.12)' }
            : paused
            ? { text: 'Pausad', color: '#b45309', bg: 'rgba(245,158,11,0.14)' }
            : { text: 'Aktiv', color: '#16a34a', bg: 'rgba(34,197,94,0.12)' };
          return (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1.3fr 1.3fr auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarClock size={14} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.label}</span>
              </div>
              <span style={{ fontSize: 12, color: C.muted }}>{r.cadence}</span>
              <span style={{ fontSize: 11, color: C.dim }}>Senast: {fmt(r.last_run)}</span>
              <span style={{ fontSize: 11, color: C.dim }}>{paused ? 'Nästa: pausad' : `Nästa: ${fmt(r.next_run)}`}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: pill.color, background: pill.bg, borderRadius: 6, padding: '3px 8px' }}>{pill.text}</span>
                {!missing && (
                  <button
                    onClick={() => onToggle(r.name, paused)}
                    title={paused ? 'Återuppta' : 'Pausa'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', color: paused ? '#16a34a' : '#b45309', border: `1px solid ${paused ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {paused ? <Play size={12} /> : <Pause size={12} />} {paused ? 'Återuppta' : 'Pausa'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RiskTable({ findings }: { findings: Finding[] }) {
  return (
    <div>
      <div style={{ ...rowGrid, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
        <span>Persona</span>
        <span>Fråga</span>
        <span>Motorn svarade</span>
        <span>Skademodell</span>
        <span>Allvarlighet</span>
      </div>
      {findings.map((f, i) => {
        const sev = SEVERITY[f.severity || 'low'] || SEVERITY.low;
        return (
          <div key={i} style={{ ...rowGrid, padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'start' }}>
            <span style={{ color: C.text }}>{f.persona ? PERSONA_SV[f.persona] || f.persona : '—'}</span>
            <span style={{ color: C.text }}>
              {f.question || '—'}
              {f.via_follow_up && <span style={{ marginLeft: 6, fontSize: 10, color: C.dim }}>(följdfråga)</span>}
            </span>
            <span style={{ color: C.muted, fontStyle: 'italic' }}>{f.engine_excerpt ? `"${f.engine_excerpt}"` : '—'}</span>
            <span style={{ color: C.text }}>{harmLabel(f.harm)}</span>
            <span>
              <span style={{ fontSize: 11, fontWeight: 600, color: sev.color, background: sev.bg, borderRadius: 6, padding: '3px 8px' }}>{sev.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendView({ trend, currentScore }: { trend: Trend; currentScore: number | null }) {
  const series = trend.series.filter((s) => s.score != null) as { month: string; score: number }[];
  const arrow = trend.delta == null ? '' : trend.delta > 0 ? '▲' : trend.delta < 0 ? '▼' : '→';
  const arrowColor = trend.delta == null ? C.dim : trend.delta > 0 ? '#16a34a' : trend.delta < 0 ? '#b91c1c' : C.muted;

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: series.length > 1 ? 16 : 0 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Beslutssäkerhet nu</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.text }}>
            {currentScore ?? '—'}
            {trend.delta != null && (
              <span style={{ fontSize: 14, color: arrowColor, marginLeft: 8 }}>
                {arrow} {trend.delta > 0 ? `+${trend.delta}` : trend.delta}
              </span>
            )}
          </div>
          {trend.previous_month && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>mot {trend.previous_month}</div>}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Lösta risker</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.text }}>{trend.resolved_count}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>motorerna svarar nu säkert</div>
        </div>
      </div>

      {series.length > 1 ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
          {series.map((s) => (
            <div key={s.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, maxWidth: 60 }}>
              <span style={{ fontSize: 10, color: C.muted }}>{s.score}</span>
              <div style={{ width: '100%', maxWidth: 32, height: `${Math.max(4, (s.score / 100) * 80)}px`, background: C.accent, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
              <span style={{ fontSize: 9, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>{s.month.slice(5)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Trend visas när minst två månadsrapporter finns.</p>
      )}
    </div>
  );
}

export function PollingQuestionsPanel({ data, clientId, mode }: { data: PollingQuestionsResp; clientId: string; mode: ViewMode }) {
  const [open, setOpen] = useState(false);
  const categories = Object.entries(data.by_category).sort((a, b) => a[0].localeCompare(b[0]));
  const editorUrl = `/insider-graph/kunder/${encodeURIComponent(clientId)}#measurement-config`;

  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title={data.is_custom ? 'Synlighets-frågor — mäter Share of Voice (egna)' : 'Synlighets-frågor — mäter Share of Voice (default)'}
        hint={open
          ? "Veckovis polling kör dessa frågor mot AI-motorerna och mäter hur ofta kunden nämns — de driver Share of Voice (skilt från risk-frågorna ovan som mäter beslutssäkerhet). Default-frågorna fylls med kundens industry/topic/service_area — du kan ersätta dem med egna via Mätningskonfig på kunddetalj."
          : `${data.total} synlighets-${data.total === 1 ? 'fråga' : 'frågor'} mäts varje vecka · ${categories.length} kategorier${data.is_custom ? ' · egna' : ' · default-templates'}`
        }
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
        badge={`${data.total}`}
      />

      {open && (
        <>
          {mode === 'ops' && !data.is_custom && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(159,81,182,0.04)', border: `1px solid ${S.inProgress.border}`, borderRadius: 8, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              <strong style={{ color: C.text }}>Default-frågor ifyllda med kundens kontext:</strong>{' '}
              industry=<code style={{ color: C.accent }}>{data.substitutions.industry}</code> ·{' '}
              topic=<code style={{ color: C.accent }}>{data.substitutions.topic}</code> ·{' '}
              service_area=<code style={{ color: C.accent }}>{data.substitutions.service_area}</code>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {categories.map(([cat, qs]) => (
              <div key={cat}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {CATEGORY_SV[cat] || cat} · {qs.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {qs.map((q, i) => (
                    <div key={i} style={{
                      padding: '8px 12px',
                      background: q.source === 'custom' ? 'rgba(159,81,182,0.04)' : 'rgba(106,126,138,0.04)',
                      border: `1px solid ${q.source === 'custom' ? S.inProgress.border : C.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                      color: C.text,
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}>
                      <span style={{ flex: 1 }}>{q.text}</span>
                      {q.source === 'custom' && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: C.accent, background: 'rgba(159,81,182,0.1)', border: `1px solid ${S.inProgress.border}`, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
                          Egen
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {mode === 'ops' && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                {data.is_custom ? 'Du har skräddarsydda frågor. Default-templates används inte.' : 'Vill du ersätta default-frågorna med egna?'}
              </span>
              <a
                href={editorUrl}
                style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 600,
                  color: C.accent, background: 'rgba(159,81,182,0.08)',
                  border: `1px solid ${S.inProgress.border}`, borderRadius: 6,
                  textDecoration: 'none', letterSpacing: '0.02em',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                Redigera i Mätningskonfig →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ActivityFeed({ runs }: { runs: import('../../_lib/jobRuns').JobRun[] | null }) {
  if (runs === null) return <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Laddar händelser…</div>;
  const filtered = runs.filter((r) => ACTIVITY_FEED_TYPES.has(r.job_type)).slice(0, 12);
  if (filtered.length === 0) {
    return <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Inga händelser ännu.</div>;
  }
  return (
    <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 10 }}>
        Senaste händelser
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((r) => {
          const stale = r.status === 'running' && isStale(r.started_at, 10);
          const dot = stale ? '#b45309' : r.status === 'success' ? '#16a34a' : r.status === 'failed' ? '#b91c1c' : '#0e7490';
          const label = JOB_LABEL[r.job_type] || r.job_type;
          const blurb = summaryBlurb(r.job_type, r.summary);
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 14px 1fr auto', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: stale ? '#b45309' : C.muted, fontFamily: 'ui-monospace, monospace' }}>{fmtRelative(r.started_at)}</span>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 0 3px ${dot}22` }} />
              <span style={{ color: C.text }}>
                <strong style={{ fontWeight: 600 }}>{label}</strong>
                {blurb && <span style={{ color: C.dim, marginLeft: 8 }}>{blurb}</span>}
                {r.error_message && <span style={{ color: '#b91c1c', marginLeft: 8 }}>· {r.error_message}</span>}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: dot, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {stale ? 'möjligen stoppad' : r.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
