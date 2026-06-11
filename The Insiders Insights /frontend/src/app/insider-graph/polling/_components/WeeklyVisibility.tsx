'use client';

import { useState, ReactNode } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import * as UI from '../../_components/ui';
import {
  PollingWeek,
  CategoryResult,
  Competitor,
  ENGINE_SV,
  CATEGORY_SV,
  cardStyle,
  catGridTrend,
  engineGrid,
  aggregateEnginesBySource,
  sentimentLabel,
  pct,
  detectModelBreaks,
  detectQuestionBreaks,
  describeModelBreak,
} from '../_shared';
import { SectionHead, Stat, Sparkline } from './common';

export function WeeklyVisibility({ weeks }: { weeks: PollingWeek[] }) {
  const latest = weeks[0];
  // Trenden ritas äldst → nyast (API:t ger nyast först).
  const chrono = [...weeks].reverse();
  const sovSeries = chrono.filter((w) => w.share_of_voice != null) as (PollingWeek & { share_of_voice: number })[];
  const sent = sentimentLabel(latest.sentiment_score);
  const cats = latest.category_results
    ? Object.entries(latest.category_results).sort((a, b) => b[1].share_of_voice - a[1].share_of_voice)
    : [];

  // Per-kategori-trend (12v): plocka SoV per vecka för varje kategori.
  const catTrend: Record<string, (number | null)[]> = {};
  if (cats.length > 0) {
    for (const [cat] of cats) catTrend[cat] = chrono.map((w) => w.category_results?.[cat]?.share_of_voice ?? null);
  }

  // Per-motor (senaste veckan + 12v-trend).
  const engineEntries = latest.per_engine
    ? Object.entries(latest.per_engine).sort((a, b) => b[1].share_of_voice - a[1].share_of_voice)
    : [];
  const engineTrend: Record<string, (number | null)[]> = {};
  for (const [eng] of engineEntries) engineTrend[eng] = chrono.map((w) => w.per_engine?.[eng]?.share_of_voice ?? null);

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Veckovis synlighet"
        hint="Det löpande måttet — hur ofta AI-motorerna nämner kunden på branschfrågor (Share of Voice), med vilket sentiment och könsbalans. Uppdateras automatiskt varje vecka. (Hur talet ska läsas — bas-kunskap vs live-signal — förklaras i rutan nedan.)"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: sovSeries.length > 1 ? 18 : 0 }}>
        <Stat label="Share of Voice" value={pct(latest.share_of_voice)} accent />
        <Stat label="Sentiment" value={sent.text} color={sent.color} />
        <ParityStat week={latest} />
      </div>

      <div style={{ fontSize: 11, color: C.dim, margin: sovSeries.length > 1 ? '0 0 6px' : '10px 0 0' }}>
        {latest.week_id}
        {latest.total_answers != null && ` · ${latest.answers_with_mention ?? 0}/${latest.total_answers} svar nämnde kunden`}
        {latest.models_used?.length ? ` · ${latest.models_used.join(', ')}` : ''}
      </div>

      <div
        style={{ fontSize: 10, color: C.dim, lineHeight: 1.5, margin: sovSeries.length > 1 ? '0 0 14px' : '6px 0 0', padding: '7px 10px', borderLeft: `2px solid ${C.border}`, borderRadius: 4 }}
      >
        <span style={{ fontWeight: 600, color: C.muted }}>Så läser du talet. </span>
        Speglar AI:s tränade minne av kunden (bas-kunskap), inte vad en live-groundad användare ser — Live-signal redovisas separat nedan. Mätt över flera körningar per fråga
        {latest.sov_ci95 != null ? `, ±${Math.round(latest.sov_ci95 * 100)} pp brusband` : ''}; vecka-mot-vecka-rörelser inom bandet är inte säkerställda.
      </div>

      {sovSeries.length > 1 && (() => {
        // Kalibreringsbrytningar: models_used-diff (modellbyte) + questions_fingerprint-
        // diff (F3, frågesettsbyte). beforeIndex pekar på veckan EFTER bytet — vi ritar
        // en lodrät markör i gapet före den stapeln; tooltip förklarar vad som bröts.
        const breaks = detectModelBreaks(sovSeries);
        const qBreaks = new Set(detectQuestionBreaks(sovSeries));
        const breakByIndex = new Map(breaks.map((b) => [b.beforeIndex, b]));
        return (
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Share of Voice över tid</span>
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 500 }}>
                ╪ = brusband (95 %) · bleka staplar = rörelse inom bruset, ej säkerställd
              </span>
              {(breaks.length > 0 || qBreaks.size > 0) && (
                <span style={{ fontSize: 10, color: C.dim, fontWeight: 500 }}>
                  · ⋮ = modell-/frågebyte (ej jämförbart över strecket)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
              {sovSeries.map((w, i) => {
                const brk = breakByIndex.get(i);
                const qBrk = qBreaks.has(i);
                const breakTitle = [
                  brk ? describeModelBreak(brk) : null,
                  qBrk ? 'Frågesettet ändrades här (mall/substitution/egna frågor) — staplar före och efter mäter olika frågor och är inte jämförbara.' : null,
                ].filter(Boolean).join(' ');
                return (
                  <div key={w.week_id} style={{ display: 'flex', alignItems: 'flex-end', flex: 1, maxWidth: (brk || qBrk) ? 60 : 48 }}>
                    {(brk || qBrk) && (
                      <div
                        title={breakTitle}
                        style={{
                          alignSelf: 'stretch', width: 0, marginRight: 8, borderLeft: `2px dashed ${C.accent}`,
                          position: 'relative', cursor: 'help', opacity: 0.7,
                        }}
                      >
                        <span style={{ position: 'absolute', top: -2, left: -6, fontSize: 11, color: C.accent }}>⋮</span>
                      </div>
                    )}
                    {(() => {
                      // P1: brusband (±CI95) som whisker + blek stapel när veckans rörelse
                      // ryms i bruset (ej statistiskt åtskild från run-to-run). Saknas
                      // jämförelse (äldsta stapeln, delta=null) → ingen blekning.
                      const sov = w.share_of_voice;
                      const ci = w.sov_ci95 ?? 0;
                      const moved = w.sov_trend?.delta != null;
                      const withinNoise = moved && !w.sov_trend?.significant;
                      const top = Math.min(1, sov + ci);
                      const bottom = Math.max(0, sov - ci);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, maxWidth: 48 }}>
                          <span style={{ fontSize: 10, color: C.muted }}>{Math.round(sov * 100)}</span>
                          <div style={{ position: 'relative', width: '100%', maxWidth: 28, height: 72, display: 'flex', alignItems: 'flex-end' }}>
                            <div style={{ width: '100%', height: `${Math.max(3, sov * 72)}px`, background: C.accent, borderRadius: '4px 4px 0 0', opacity: withinNoise ? 0.4 : 0.85 }} />
                            {ci > 0 && (
                              <div
                                title={`Brusband ±${Math.round(ci * 100)} pp (95 %)${withinNoise ? ' — veckans rörelse ryms i bruset' : ''}`}
                                style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: `${bottom * 72}px`, height: `${(top - bottom) * 72}px`, width: 1, background: C.muted, opacity: 0.7, cursor: 'help' }}
                              >
                                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 7, height: 1, background: C.muted }} />
                                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 7, height: 1, background: C.muted }} />
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 9, color: C.dim, fontFamily: 'ui-monospace, monospace' }}>{w.week_id.slice(5)}</span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {cats.length > 0 && (
        <Block label="Per kategori — senaste veckan + trend" summary={`${cats.length} ${cats.length === 1 ? 'kategori' : 'kategorier'}`} defaultOpen>
          <div style={{ ...catGridTrend, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
            <span>Kategori</span>
            <span>SoV</span>
            <span>Sentiment</span>
            <span>Svar</span>
            <span>Trend (12v)</span>
          </div>
          {cats.map(([cat, r]) => (
            <CategoryRow
              key={cat}
              cat={cat}
              row={r}
              competitors={latest.category_competitors?.[cat] || []}
              clientSoV={r.share_of_voice}
              trend={catTrend[cat]}
            />
          ))}
        </Block>
      )}

      {engineEntries.length > 0 && (() => {
        const training = aggregateEnginesBySource(engineEntries, 'training');
        const webRag = aggregateEnginesBySource(engineEntries, 'web_rag');
        return (
          <Block label="Per AI-motor — senaste veckan + trend" summary="Bas-kunskap vs Live-signal" defaultOpen>
            <div style={{ fontSize: 10, color: C.dim, fontStyle: 'italic', marginBottom: 8 }}>
              Bas-kunskap och Live-signal har olika fördelningar — de medeltalas aldrig, bara jämförs sida vid sida.
            </div>
            {training.engines.length > 0 && (
              <EnginesBySourceSection
                title="AI Base Knowledge"
                subtitle="RLHF-tränade modeller — det AI:n redan kan från sin träning (ChatGPT, Gemini, Claude, Mistral)"
                agg={training}
                trend={engineTrend}
              />
            )}
            {webRag.engines.length > 0 && (
              <EnginesBySourceSection
                title="AI Live Signal"
                subtitle="Web-RAG — vad AI:n hittar live på webben just nu (Perplexity Sonar)"
                agg={webRag}
                trend={engineTrend}
              />
            )}
          </Block>
        );
      })()}
    </div>
  );
}

/** Parity v2: porträtterad könsbalans (vilka personer AI själv namnger, könsestimerat)
 * vs kundens ledningsbaseline — gapet är insikten. Wilson-bandet + n/okänd-grindning
 * speglar backendens reliable-logik: tunt underlag märks, tolkas aldrig som trend. */
function ParityStat({ week }: { week: PollingWeek }) {
  const portrayed = week.parity_portrayed ?? week.parity_index;
  const n = week.parity_n ?? 0;
  const thin = portrayed != null && (n < 3 || (week.parity_unknown_share ?? 0) > 0.5);
  const baseline = week.parity_baseline;
  const gap = week.parity_gap;
  const ci = week.parity_ci95;
  return (
    <div>
      <Stat label="Könsbalans (porträtterad)" value={pct(portrayed)} color={thin ? C.dim : undefined} />
      <div style={{ fontSize: 10, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
        {portrayed == null ? (
          'Inga namngivna personer i AI-svaren ännu.'
        ) : (
          <>
            {n > 0 && `${n} namngivna`}
            {ci && ` · ${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)} % (95 %)`}
            {gap != null && baseline ? (
              <span title={`Baseline: ${baseline.source}${baseline.as_of ? ` (${baseline.as_of})` : ''}. AI:s framlyfta personer är inte samma kohort som den formella ledningen.`} style={{ cursor: 'help' }}>
                {' '}· vs ledning {Math.round(baseline.value * 100)} % →{' '}
                <span style={{ fontWeight: 600, color: thin ? C.dim : Math.abs(gap) > 0.1 ? C.accent : C.muted }}>
                  gap {gap > 0 ? '+' : '−'}{Math.abs(Math.round(gap * 100))} pe
                </span>
              </span>
            ) : (
              week.parity_portrayed != null && ' · baseline saknas — sätt ledningens kvinnoandel i kundkortet'
            )}
            {thin && (
              <span style={{ color: C.muted, fontWeight: 600 }}> · tunt underlag, ej trend</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Kollapsbar sub-sektion inom kortet — segmenterar dataväggen och låter de tunga
// tabellerna fällas in. Tillgänglig via toggleProps (tangentbord + aria-expanded).
function Block({
  label, summary, defaultOpen = true, children,
}: { label: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div
        {...UI.toggleProps(open, () => setOpen((o) => !o))}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: open ? 8 : 0 }}
      >
        <UI.Chevron open={open} size={9} />
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{label}</span>
        {summary && <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>{summary}</span>}
      </div>
      {open && children}
    </div>
  );
}

export function EnginesBySourceSection({
  title,
  subtitle,
  agg,
  trend,
}: {
  title: string;
  subtitle: string;
  agg: ReturnType<typeof aggregateEnginesBySource>;
  trend: Record<string, (number | null)[]>;
}) {
  const sent = sentimentLabel(agg.sentiment);
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11, color: C.muted, display: 'flex', gap: 12 }}>
          <span>SoV: <span style={{ fontWeight: 600, color: C.text }}>{agg.sov != null ? `${Math.round(agg.sov * 100)}%` : '—'}</span></span>
          <span>Sentiment: <span style={{ fontWeight: 600, color: sent.color }}>{sent.text}</span></span>
          <span style={{ color: C.dim }}>{agg.mentions}/{agg.answers} svar</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>{subtitle}</div>
      <div style={{ ...engineGrid, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
        <span>Motor</span>
        <span>SoV</span>
        <span>Sentiment</span>
        <span>Nämner</span>
        <span>Trend (12v)</span>
      </div>
      {agg.engines.map(([eng, r]) => {
        const es = sentimentLabel(r.sentiment_score);
        return (
          <div key={eng} style={{ ...engineGrid, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: 'center' }}>
            <span style={{ color: C.text, fontWeight: 600 }}>{ENGINE_SV[eng] || eng}</span>
            <span style={{ color: C.text }}>{Math.round(r.share_of_voice * 100)}%</span>
            <span style={{ color: es.color }}>{es.text}</span>
            <span style={{ color: C.dim }}>{r.mention_count}/{r.answer_count}</span>
            <Sparkline series={trend[eng]} />
          </div>
        );
      })}
    </div>
  );
}

export function CategoryRow({ cat, row, competitors, clientSoV, trend }: {
  cat: string;
  row: CategoryResult;
  competitors: Competitor[];
  clientSoV: number;
  trend: (number | null)[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const cs = sentimentLabel(row.sentiment_score);
  const canExpand = competitors.length > 0;
  return (
    <>
      <div
        {...(canExpand ? UI.toggleProps(open, () => setOpen((o) => !o)) : {})}
        style={{
          ...catGridTrend,
          padding: '8px 0',
          borderBottom: open ? 'none' : `1px solid ${C.border}`,
          fontSize: 12,
          alignItems: 'center',
          cursor: canExpand ? 'pointer' : 'default',
        }}
        title={canExpand ? 'Klicka för att se vilka konkurrenter AI nämner i den här kategorin' : 'Konkurrent-data fylls vid nästa polling-körning'}
      >
        <span style={{ color: C.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {canExpand && <UI.Chevron open={open} size={9} />}
          {CATEGORY_SV[cat] || cat}
        </span>
        <span style={{ color: C.text }}>{Math.round(row.share_of_voice * 100)}%</span>
        <span style={{ color: cs.color }}>{cs.text}</span>
        <span style={{ color: C.dim }}>{Math.round(row.mention_count)}/{Math.round(row.answer_count)}</span>
        <Sparkline series={trend} />
      </div>
      {open && (
        <div style={{ padding: '8px 12px 14px 22px', borderBottom: `1px solid ${C.border}`, background: 'rgba(106,126,138,0.03)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 8 }}>
            Vilka AI nämner istället — top {competitors.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CompetitorBar name="Ni" share={clientSoV} highlight />
            {competitors.map((c) => (
              <CompetitorBar key={c.name} name={c.name} share={c.share} mentions={c.mentions} />
            ))}
          </div>
          <p style={{ fontSize: 10, color: C.dim, marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
            Andel av kategorins {Math.round(row.answer_count)} AI-svar där respektive aktör nämns. Stora gap är en tydlig "varför" — antingen att berätta tydligare, eller en konkurrent som äger berättelsen.
          </p>
        </div>
      )}
    </>
  );
}

export function CompetitorBar({ name, share, mentions, highlight }: { name: string; share: number; mentions?: number; highlight?: boolean }) {
  const pctVal = Math.max(0, Math.min(1, share)) * 100;
  const color = highlight ? C.accent : '#6b6e7e';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 60px', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ color: highlight ? C.accent : C.text, fontWeight: highlight ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <div style={{ height: 8, background: 'rgba(106,126,138,0.12)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: color, opacity: 0.85, borderRadius: 4 }} />
      </div>
      <span style={{ color: C.muted, fontFamily: 'ui-monospace, monospace', textAlign: 'right' }}>
        {Math.round(share * 100)}%{mentions != null ? ` · ${mentions}` : ''}
      </span>
    </div>
  );
}
