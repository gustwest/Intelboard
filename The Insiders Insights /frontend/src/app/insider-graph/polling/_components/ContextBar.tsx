'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { graphColors as C } from '../../_components/GraphPageShell';
import { proxyShareUrl } from '../../_lib/api';
import { fmtTime } from '@/lib/datetime';
import {
  Client,
  EngineHealth,
  EngineHealthResp,
  Hero,
  ViewMode,
  S,
  selectStyle,
  knowledgeSourceFor,
} from '../_shared';

export function StickyContextBar({ clients, selected, onSelectClient, months, month, onSelectMonth, onRefresh, isDraft, mode, onModeChange, hero, reportShareUrl, engineHealth, onRefreshEngineHealth }: {
  clients: Client[];
  selected: string | null;
  onSelectClient: (v: string) => void;
  months: string[] | null;
  month: string | null;
  onSelectMonth: (v: string) => void;
  onRefresh: () => void;
  isDraft: boolean;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  hero: Hero;
  reportShareUrl: string | null;
  engineHealth: EngineHealthResp | null;
  onRefreshEngineHealth: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fullShareUrl = reportShareUrl ? proxyShareUrl(reportShareUrl) : '';
  async function copyShareLink() {
    if (!fullShareUrl) return;
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Kopiera länken:', fullShareUrl);
    }
  }
  const deltaColor = hero.deltaTone === 'up' ? '#16a34a' : hero.deltaTone === 'down' ? '#b91c1c' : C.muted;
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        margin: '0 -24px 20px',
        padding: '14px 24px',
        background: 'rgba(248,249,250,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Kund</label>
          <select value={selected || ''} onChange={(e) => onSelectClient(e.target.value)} style={selectStyle}>
            {clients.length === 0 && <option value="">Inga kunder</option>}
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>{c.company_name || c.client_id}</option>
            ))}
          </select>

          {months && months.length > 0 && (
            <>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: 8 }}>Rapport</label>
              <select value={month || ''} onChange={(e) => onSelectMonth(e.target.value)} style={selectStyle}>
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </>
          )}

          <button
            onClick={onRefresh}
            title="Uppdatera all data"
            style={{ padding: '8px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          >
            <RefreshCw size={14} />
          </button>

          {isDraft && (
            <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: 'rgba(224, 142, 121,0.12)', border: '1px solid rgba(224, 142, 121,0.3)', borderRadius: 5, padding: '3px 8px', letterSpacing: '0.04em' }}>
              INTERNT UTKAST
            </span>
          )}

          {reportShareUrl && (
            <>
              <a
                href={fullShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Öppna utskriftsvyn — Skriv ut eller Spara som PDF där"
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: C.muted, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, textDecoration: 'none', cursor: 'pointer', letterSpacing: '0.02em' }}
              >
                Utskriftsvy / PDF
              </a>
              <button
                onClick={copyShareLink}
                title="Kopiera direktlänk till denna månadsrapport"
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: copied ? S.resolved.fg : C.muted, background: copied ? S.resolved.bg : 'transparent', border: `1px solid ${copied ? S.resolved.border : C.border}`, borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em' }}
              >
                {copied ? 'Länk kopierad' : 'Kopiera länk'}
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Ops/Kund segmented toggle */}
        <div style={{ display: 'inline-flex', background: 'rgba(106,126,138,0.08)', borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
          {(['ops', 'customer'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              title={m === 'ops' ? 'Ops-läge: full insyn, jobbknappar, raw siffror' : 'Kund-läge: presentationsklar — bara plain-text + trender'}
              style={{
                padding: '6px 14px',
                background: mode === m ? '#ffffff' : 'transparent',
                color: mode === m ? C.text : C.muted,
                border: 'none',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {m === 'ops' ? 'Ops' : 'Kund'}
            </button>
          ))}
        </div>

        {/* Hero-tal — metriknamn (label) ovanför så talet alltid är självförklarande */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, marginBottom: 4 }}>
            {hero.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: C.text, lineHeight: 1 }}>{hero.primary}</span>
            {hero.unit && <span style={{ fontSize: 12, color: C.muted }}>{hero.unit}</span>}
            {hero.stage && <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, background: 'rgba(224, 142, 121,0.1)', padding: '3px 8px', borderRadius: 5, letterSpacing: '0.04em' }}>{hero.stage}</span>}
            {hero.delta && <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor }}>{hero.delta}</span>}
          </div>
        </div>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{hero.tagline}</p>

      {/* Motor-status — synliggör om probarna faktiskt fungerar just nu */}
      {engineHealth && <EngineHealthBar data={engineHealth} onRefresh={onRefreshEngineHealth} />}
    </div>
  );
}

export function EngineHealthBar({ data, onRefresh }: { data: EngineHealthResp; onRefresh: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const liveOk = data.engines.filter((e) => e.status === 'live' && e.ok === true).length;
  const liveTotal = data.engines.filter((e) => e.status === 'live').length;
  const banner = liveOk === 0 && liveTotal > 0
    ? { text: 'Ingen probe-motor svarar — mätningarna ger tom data tills detta är åtgärdat', tone: 'urgent' as const }
    : liveOk < liveTotal
      ? { text: `${liveOk}/${liveTotal} probe-motorer svarar — partiella mätningar`, tone: 'waiting' as const }
      : null;

  // Gruppera probarna efter kunskapskälla — bas-kunskap (RLHF, training-data)
  // vs live-signal (web-RAG). Olika fördelningar → ALDRIG medeltala över dem.
  // Planerade motorer (perplexity-stub, copilot etc) hamnar i "training" som default.
  const trainingEngines = data.engines.filter((e) => knowledgeSourceFor(e.id) === 'training');
  const webRagEngines = data.engines.filter((e) => knowledgeSourceFor(e.id) === 'web_rag');

  const renderChips = (engines: typeof data.engines) => engines.map((e) => (
    <EngineChip
      key={e.id}
      engine={e}
      active={openId === e.id}
      onClick={() => setOpenId((curr) => (curr === e.id ? null : e.id))}
    />
  ));

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Sektion 1: Bas-kunskap (training-data baserade modeller) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            title="Modeller som svarar utifrån sin träningsdata (RLHF). Påverkas av long-form innehåll, Wikipedia, autoritativa källor som hamnar i nästa träningsrunda."
            style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginRight: 4, cursor: 'help' }}
          >
            Bas-kunskap
          </span>
          {renderChips(trainingEngines)}
        </div>

        {/* Sektion 2: Live-signal (web-RAG) — bara om vi har sådana motorer */}
        {webRagEngines.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              title="Modeller som söker live på webben (web-RAG) innan de svarar. Påverkas av fresh press, SEO, structured data, nyhetscykel."
              style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginRight: 4, cursor: 'help' }}
            >
              Live-signal
            </span>
            {renderChips(webRagEngines)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button
          onClick={async () => { setRefreshing(true); await onRefresh(); setTimeout(() => setRefreshing(false), 600); }}
          title={`Senast kollat ${fmtTime(data.checked_at)} — klick för att probe på nytt`}
          style={{
            padding: '3px 8px', fontSize: 10, fontWeight: 600,
            color: refreshing ? C.accent : C.muted, background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 5, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          <RefreshCw size={10} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          {refreshing ? 'Probar…' : 'Kolla'}
        </button>
        <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>
          {fmtTime(data.checked_at)}
        </span>
      </div>

      {banner && (
        <div style={{
          marginTop: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
          color: banner.tone === 'urgent' ? S.open.fg : S.waiting.fg,
          background: banner.tone === 'urgent' ? S.open.bg : S.waiting.bg,
          border: `1px solid ${banner.tone === 'urgent' ? S.open.border : S.waiting.border}`,
          borderRadius: 6,
        }}>
          {banner.text}
        </div>
      )}

      {openId && (() => {
        const e = data.engines.find((x) => x.id === openId);
        if (!e) return null;
        return (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(106,126,138,0.05)', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{e.label}</strong>
            <span style={{ color: C.muted, marginLeft: 6 }}>· {e.vendor}</span>
            {e.status === 'planned' ? (
              <>
                <span style={{ marginLeft: 8, color: S.neutral.fg, fontWeight: 600 }}>Planerad</span>
                {e.note && <div style={{ color: C.muted, marginTop: 4 }}>{e.note}</div>}
              </>
            ) : e.ok ? (
              <>
                <span style={{ marginLeft: 8, color: S.resolved.fg, fontWeight: 600 }}>Svarar</span>
                <div style={{ color: C.muted, marginTop: 4 }}>Latens: {e.latency_ms} ms</div>
              </>
            ) : (
              <>
                <span style={{ marginLeft: 8, color: S.open.fg, fontWeight: 600 }}>Fel</span>
                <div style={{ color: C.muted, marginTop: 4 }}>
                  {e.error || 'Okänt fel'}
                  {e.latency_ms != null && ` · efter ${e.latency_ms} ms`}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export function EngineChip({ engine, active, onClick }: { engine: EngineHealth; active: boolean; onClick: () => void }) {
  const tone =
    engine.status === 'planned' ? S.neutral :
    engine.ok === true ? S.resolved :
    engine.ok === false ? S.open : S.neutral;
  const dotChar = engine.status === 'planned' ? '◌' : '●';
  const subtitle =
    engine.status === 'planned' ? 'Planerad' :
    engine.ok === true ? `${engine.latency_ms} ms` :
    'Fel';
  return (
    <button
      onClick={onClick}
      title={engine.status === 'planned' ? engine.note || 'Planerad motor' : engine.error || 'OK'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', fontSize: 11, fontWeight: 600,
        color: tone.fg, background: active ? tone.bg : 'transparent',
        border: `1px solid ${active ? tone.fg : tone.border}`,
        borderRadius: 999, cursor: 'pointer', letterSpacing: '0.02em',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>{dotChar}</span>
      {engine.label}
      <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.75, letterSpacing: '0.03em' }}>· {subtitle}</span>
    </button>
  );
}
