'use client';

import { useMemo, useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import {
  PollingWeek,
  CompetitorTrend,
  buildCompetitorAnalytics,
  CATEGORY_SV,
  cardStyle,
  pct,
} from '../_shared';
import { SectionHead, Sparkline } from './common';

/**
 * Konkurrent-kontext per kategori som egen analytisk yta (#2, väg A): vem äger
 * berättelsen i varje kategori, över tid, och var är gapet störst — byggt klient-side
 * ur de veckovisa category_competitors-snapshotsen som redan skeppas i PollingWeek.
 *
 * Väg A: konkurrentsiffrorna är n≈1 (NER körs på ett svar per fråga), inte upprepat
 * samplade som SoV. Därför grindas trender (≥10pp över ≥2 veckor) och en disclosure
 * gör mätrigorositeten explicit — vi läser smårörelser som riktning, inte exakt tal.
 */
export function CompetitorSurface({ weeks }: { weeks: PollingWeek[] }) {
  const analytics = useMemo(() => buildCompetitorAnalytics(weeks), [weeks]);
  const cats = analytics.categories;
  const [activeCat, setActiveCat] = useState(cats[0]?.cat ?? '');

  const hasAny = cats.some((c) => c.competitors.length > 0);
  if (!hasAny) return null;

  const active = cats.find((c) => c.cat === activeCat) ?? cats[0];

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <SectionHead
        title="Konkurrent-analys per kategori"
        hint="Vilka aktörer AI-motorerna nämner i varje kategori, över tid — vem äger berättelsen och var är gapet störst. Komplement till den hopfällda raden i Veckovis synlighet."
      />

      {/* Kategori-väljare */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {cats.map((c) => {
          const on = c.cat === active.cat;
          const disabled = c.competitors.length === 0;
          return (
            <button
              key={c.cat}
              onClick={() => !disabled && setActiveCat(c.cat)}
              disabled={disabled}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                cursor: disabled ? 'default' : 'pointer',
                color: on ? C.accent : disabled ? C.dim : C.text,
                background: on ? 'rgba(224, 142, 121,0.08)' : 'transparent',
                border: `1px solid ${on ? 'rgba(224, 142, 121,0.4)' : C.border}`,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {CATEGORY_SV[c.cat] || c.cat}
              <span style={{ marginLeft: 6, fontSize: 10, color: C.dim }}>{c.competitors.length}</span>
            </button>
          );
        })}
      </div>

      {/* Gap-callout */}
      {active.largestGap && active.largestGap.gap > 0 && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, padding: '8px 12px', borderLeft: `2px solid ${C.accent}`, borderRadius: 4, lineHeight: 1.5 }}>
          Störst gap i {CATEGORY_SV[active.cat] || active.cat}: <strong style={{ color: C.text }}>{active.largestGap.name}</strong> nämns
          i {pct(active.largestGap.gap + active.clientAvgShare)} av svaren mot ert {pct(active.clientAvgShare)}
          {' '}— ett gap på {Math.round(active.largestGap.gap * 100)} pp.
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 70px 90px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 6 }}>
        <span>Aktör</span>
        <span>Andel (snitt)</span>
        <span>Trend</span>
        <span>Över tid</span>
      </div>

      <LeaderRow name="Ni" share={active.clientAvgShare} series={active.clientSeries} trend="flat" highlight />
      {active.competitors.map((c) => (
        <LeaderRow key={c.name} name={c.name} share={c.avgShare} series={c.series} trend={c.trend} weeksPresent={c.weeksPresent} />
      ))}

      {/* Cross-category-matris */}
      {analytics.crossCategory.some((a) => a.categoriesCount > 1) && (
        <CrossCategoryMatrix analytics={analytics} />
      )}

      {/* Väg A disclosure */}
      <p style={{ fontSize: 10, color: C.dim, margin: '14px 0 0', lineHeight: 1.5, padding: '8px 10px', borderLeft: `2px solid ${C.border}`, borderRadius: 4 }}>
        <span style={{ fontWeight: 600, color: C.muted }}>Så läser du detta. </span>
        Konkurrentandelarna mäts på ett AI-svar per fråga, inte upprepat som Share of Voice — läs dem som riktning, inte exakta tal. En trendpil visas bara vid en rörelse över ~10 procentenheter över minst två veckor; mindre rörelser räknas som brus.
      </p>
    </div>
  );
}

const TREND_VIS: Record<CompetitorTrend, { arrow: string; color: string }> = {
  up: { arrow: '▲', color: '#16a34a' },
  down: { arrow: '▼', color: '#b91c1c' },
  flat: { arrow: '→', color: '#6b6e7e' },
};

function LeaderRow({ name, share, series, trend, weeksPresent, highlight }: {
  name: string; share: number; series: (number | null)[]; trend: CompetitorTrend; weeksPresent?: number; highlight?: boolean;
}) {
  const t = TREND_VIS[trend];
  const pctVal = Math.max(0, Math.min(1, share)) * 100;
  const barColor = highlight ? C.accent : '#6b6e7e';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 70px 90px', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
      <span style={{ color: highlight ? C.accent : C.text, fontWeight: highlight ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
        {weeksPresent != null && <span style={{ marginLeft: 6, fontSize: 10, color: C.dim }}>{weeksPresent}v</span>}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: 'rgba(106,126,138,0.12)', borderRadius: 4, overflow: 'hidden', maxWidth: 220 }}>
          <div style={{ width: `${pctVal}%`, height: '100%', background: barColor, opacity: 0.85, borderRadius: 4 }} />
        </div>
        <span style={{ color: C.muted, fontFamily: 'ui-monospace, monospace', minWidth: 36, textAlign: 'right' }}>{Math.round(pctVal)}%</span>
      </div>
      <span style={{ color: highlight ? C.dim : t.color, fontSize: 13 }}>{highlight ? '—' : t.arrow}</span>
      <Sparkline series={series} />
    </div>
  );
}

function CrossCategoryMatrix({ analytics }: { analytics: ReturnType<typeof buildCompetitorAnalytics> }) {
  const catKeys = analytics.categories.map((c) => c.cat);
  // Visa aktörer som syns i fler än en kategori (de som "äger flera berättelser") — topp 8.
  const actors = analytics.crossCategory.filter((a) => a.categoriesCount > 1).slice(0, 8);
  const shareByActorCat: Record<string, Record<string, number>> = {};
  for (const c of analytics.categories) {
    for (const comp of c.competitors) (shareByActorCat[comp.name] ||= {})[c.cat] = comp.avgShare;
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>
        Vem äger flera kategorier
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${catKeys.length}, 1fr)`, gap: 4, minWidth: 480 }}>
          <span />
          {catKeys.map((cat) => (
            <span key={cat} style={{ fontSize: 10, color: C.muted, fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {CATEGORY_SV[cat] || cat}
            </span>
          ))}
          {actors.map((a) => (
            <Row key={a.name} name={a.name} catKeys={catKeys} shares={shareByActorCat[a.name] || {}} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ name, catKeys, shares }: { name: string; catKeys: string[]; shares: Record<string, number> }) {
  return (
    <>
      <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', alignSelf: 'center' }}>{name}</span>
      {catKeys.map((cat) => {
        const s = shares[cat] || 0;
        return (
          <div key={cat} title={`${CATEGORY_SV[cat] || cat}: ${Math.round(s * 100)}%`}
            style={{ height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s > 0 ? `rgba(224, 142, 121,${Math.min(0.85, 0.12 + s * 0.7)})` : 'rgba(106,126,138,0.06)',
              color: s > 0.4 ? '#fff' : C.muted, fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
            {s > 0 ? `${Math.round(s * 100)}` : ''}
          </div>
        );
      })}
    </>
  );
}
