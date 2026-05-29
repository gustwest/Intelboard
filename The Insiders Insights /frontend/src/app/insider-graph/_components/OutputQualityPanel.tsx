'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gauge, ExternalLink, Sparkles } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';
import { VerdictBadge, ScoreBadge, ShadowGateBadge } from './OutputQualityBits';

type LogSummary = {
  log_id: string;
  logged_at: string | null;
  source: string | null;
  scope: string | null;
  connector: string | null;
  bundle_score: number;
  verdict: string;
  claim_count: number;
  audience_count: number | null;
  flag_count: number;
  llm_unavailable: boolean;
};

type LogDetail = LogSummary & {
  top_improvements: string[];
  per_connector: Record<string, { avg_score: number; claim_count: number; action_counts: Record<string, number> }>;
};

/** Liten panel på kundkortet: senaste output-quality-loggen + link till detaljsidan. */
export default function OutputQualityPanel({ clientId }: { clientId: string }) {
  const [latest, setLatest] = useState<LogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await graphFetch<{ items: LogSummary[] }>(
          `/api/output-quality/logs/${clientId}?limit=1&source=compile_schema`,
        );
        if (cancelled) return;
        if (!list.items.length) { setLoaded(true); return; }
        // Hämta full detalj för senaste loggen (för top_improvements + per_connector)
        const detail = await graphFetch<LogDetail>(
          `/api/output-quality/logs/${clientId}/${list.items[0].log_id}`,
        );
        if (cancelled) return;
        setLatest(detail);
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };

  if (!loaded) {
    return <div style={card}><div style={{ fontSize: 12, color: C.muted }}>Laddar output-kvalitet…</div></div>;
  }

  if (error) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 8 }}>
          <Gauge size={16} color={C.accent} /> Output-kvalitet
        </div>
        <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>
      </div>
    );
  }

  if (!latest) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 8 }}>
          <Gauge size={16} color={C.accent} /> Output-kvalitet
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          Ingen logg än — kör <strong>Återpublicera</strong> för att producera första scoringen.
        </div>
      </div>
    );
  }

  // Sortera connectors på avg_score stigande (sämst överst)
  const connectorRows = Object.entries(latest.per_connector || {})
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.avg_score - b.avg_score);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>
          <Gauge size={16} color={C.accent} /> Output-kvalitet
        </div>
        <Link
          href={`/insider-graph/kunder/${clientId}/output-quality`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
        >
          Visa alla loggar <ExternalLink size={11} />
        </Link>
      </div>

      {/* Översikt: stor score + verdict + sammanfattningssiffror */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <ScoreBadge score={latest.bundle_score} size="lg" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <VerdictBadge verdict={latest.verdict} />
            <ShadowGateBadge source={latest.source} />
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {latest.claim_count} claims · {latest.flag_count} flagg{latest.flag_count === 1 ? 'a' : 'or'}
            {latest.audience_count != null && (
              <> · audience {latest.audience_count > 0 ? '✓' : '⨯'}</>
            )}
            {latest.logged_at && (
              <> · {new Date(latest.logged_at).toLocaleString('sv-SE')}</>
            )}
          </div>
        </div>
      </div>

      {/* LLM-otillgänglig: poängen är 0 och inte meningsfull */}
      {latest.llm_unavailable && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#92400e', marginBottom: 12 }}>
          Validator-LLM:n var otillgänglig vid den här körningen — poängen är inte att lita på.
        </div>
      )}

      {/* Top-3 improvements — LLM-genererade åtgärder i naturligt språk */}
      {latest.top_improvements?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            <Sparkles size={11} /> Åtgärdsförslag
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#3a4b56', lineHeight: 1.55 }}>
            {latest.top_improvements.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* Per-connector mini-tabell — visar vilken connector som drar ner */}
      {connectorRows.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Per connector
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {connectorRows.map((c) => {
              const total = (c.action_counts?.publish ?? 0) + (c.action_counts?.transform ?? 0) + (c.action_counts?.drop ?? 0) || 1;
              const dropPct = ((c.action_counts?.drop ?? 0) / total) * 100;
              const transformPct = ((c.action_counts?.transform ?? 0) / total) * 100;
              const publishPct = ((c.action_counts?.publish ?? 0) / total) * 100;
              return (
                <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <div style={{ fontFamily: 'ui-monospace, monospace', color: '#3a4b56' }}>{c.name}</div>
                  <ScoreBadge score={c.avg_score} size="sm" />
                  <div style={{ display: 'flex', width: 100, height: 6, borderRadius: 3, overflow: 'hidden', background: '#eef0f1' }}>
                    {publishPct > 0 && <div style={{ width: `${publishPct}%`, background: '#22c55e' }} title={`publish ${publishPct.toFixed(0)}%`} />}
                    {transformPct > 0 && <div style={{ width: `${transformPct}%`, background: '#f59e0b' }} title={`transform ${transformPct.toFixed(0)}%`} />}
                    {dropPct > 0 && <div style={{ width: `${dropPct}%`, background: '#ef4444' }} title={`drop ${dropPct.toFixed(0)}%`} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
