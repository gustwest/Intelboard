'use client';

import { useEffect, useState, useCallback } from 'react';
import { Cpu, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch } from '../_lib/api';

// --- Speglar /api/model-registry, /api/model-drift, /api/model-changes ---

type RegistryEntry = {
  role: string;
  model_id: string;
  provider: string;
  purpose: string;
  latest_known: string;
  checked_at: string;
  effective_since: string;
};
type RegistryResp = { entries: RegistryEntry[]; summary: { total: number; behind_latest: number } };

type DriftFinding = {
  id: string;
  kind: string;
  severity: string;
  role: string | null;
  title: string;
  details: string | null;
  path: string | null;
  model_id: string | null;
  last_seen_at: string | null;
};
type DriftResp = { findings: DriftFinding[]; total: number; counts: Record<string, number> };

type ModelChange = {
  id: string;
  role: string;
  old_model_id: string | null;
  new_model_id: string | null;
  old_provider: string | null;
  new_provider: string | null;
  effective_since: string | null;
  recorded_at: string | null;
};
type ChangesResp = { changes: ModelChange[]; total: number };

const KIND_LABEL: Record<string, string> = {
  behind_latest: 'Ligger efter senaste',
  stale_checked: 'Ej verifierad >90d',
  unauthorized_hardcode: 'Ohanterat model-ID',
  model_unavailable: 'Otillgänglig modell',
};

function relative(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'nyss';
  if (s < 3600) return `${Math.floor(s / 60)} min sedan`;
  if (s < 86400) return `${Math.floor(s / 3600)} tim sedan`;
  return `${Math.floor(s / 86400)} d sedan`;
}

export default function ModelHealthPage() {
  const [registry, setRegistry] = useState<RegistryResp | null>(null);
  const [drift, setDrift] = useState<DriftResp | null>(null);
  const [changes, setChanges] = useState<ChangesResp | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRefreshing(true);
    Promise.all([
      graphFetch<RegistryResp>('/api/model-registry').then(setRegistry).catch(() => setRegistry(null)),
      graphFetch<DriftResp>('/api/model-drift').then(setDrift).catch(() => setDrift(null)),
      graphFetch<ChangesResp>('/api/model-changes?limit=10').then(setChanges).catch(() => setChanges(null)),
    ])
      .catch((e) => setError(e?.message || 'Kunde inte hämta modell-status'))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const behind = registry?.summary.behind_latest ?? 0;
  const driftTotal = drift?.total ?? 0;

  return (
    <GraphPageShell
      title="Modell-hälsa"
      icon={<Cpu size={22} />}
      subtitle="Vilka AI-modeller systemet kör, om de ligger efter senaste, och drift-flaggor. Auktoritativ källa: services/model_registry. Veckovis drift-scan + dagligt tillgänglighetstest matar denna vy."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <HealthPill
          ok={behind === 0 && driftTotal === 0}
          okText="Alla modeller på senaste · inga drift-flaggor"
          warnText={`${behind} efter senaste · ${driftTotal} drift-flagga${driftTotal === 1 ? '' : 'r'}`}
        />
        <button
          onClick={load}
          title="Ladda om"
          disabled={refreshing}
          style={{
            marginLeft: 'auto', padding: '6px 8px', border: `1px solid ${C.border}`,
            background: C.card, borderRadius: 6, cursor: refreshing ? 'wait' : 'pointer',
            color: C.muted, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}
        >
          <RefreshCw size={12} className={refreshing ? 'spin' : undefined} /> Uppdatera
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 0.8s linear infinite; transform-origin: center }`}</style>

      {error && <UI.StatusBanner tone="err" style={{ marginBottom: 16 }}>{error}</UI.StatusBanner>}

      {/* Sektion 1: Drift-flaggor (visas bara om det finns några — annars är allt grönt) */}
      {drift && drift.findings.length > 0 && (
        <UI.Card padding="0" style={{ marginBottom: 16 }}>
          <SectionBar title="Drift-flaggor att åtgärda" count={drift.findings.length} tone="warn" />
          {drift.findings.map((f) => (
            <div key={f.id} style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color={f.severity === 'warning' ? '#f59e0b' : C.muted} />
                <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{f.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>
                  {KIND_LABEL[f.kind] || f.kind}{f.last_seen_at ? ` · ${relative(f.last_seen_at)}` : ''}
                </span>
              </div>
              {f.details && <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{f.details}</div>}
            </div>
          ))}
        </UI.Card>
      )}

      {/* Sektion 2: Modell-registret — alla roller */}
      <UI.Card padding="0" style={{ marginBottom: 16 }}>
        <SectionBar title="Modeller i drift" count={registry?.entries.length ?? 0} tone="neutral" />
        {registry === null ? (
          <div style={{ padding: '24px 16px', color: C.muted, fontSize: 13 }}>Laddar…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>
                  <Th>Roll</Th><Th>Modell</Th><Th>Leverantör</Th><Th>Senaste känd</Th><Th>Status</Th><Th>Verifierad</Th>
                </tr>
              </thead>
              <tbody>
                {registry.entries.map((e) => {
                  const isBehind = e.model_id !== e.latest_known;
                  return (
                    <tr key={e.role} style={{ borderTop: `1px solid ${C.border}` }}>
                      <Td><span style={{ fontFamily: 'ui-monospace, monospace', color: C.text }}>{e.role}</span></Td>
                      <Td><span style={{ color: C.text, fontWeight: 600 }}>{e.model_id}</span></Td>
                      <Td><span style={{ color: C.muted }}>{e.provider}</span></Td>
                      <Td>
                        {isBehind
                          ? <span style={{ color: '#f59e0b' }}>{e.latest_known}</span>
                          : <span style={{ color: C.dim }}>= aktuell</span>}
                      </Td>
                      <Td>
                        {isBehind
                          ? <Badge tone="warn">Efter senaste</Badge>
                          : <Badge tone="ok">Senaste</Badge>}
                      </Td>
                      <Td><span style={{ color: C.dim }}>{e.checked_at}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </UI.Card>

      {/* Sektion 3: Senaste modellbyten (kalibreringsbrytningar) */}
      {changes && changes.changes.length > 0 && (
        <UI.Card padding="0">
          <SectionBar title="Senaste modellbyten" count={changes.changes.length} tone="neutral" />
          {changes.changes.map((c) => (
            <div key={c.id} style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', color: C.muted, minWidth: 130 }}>{c.role}</span>
              <span style={{ color: C.dim }}>{c.old_model_id || '—'}</span>
              <ArrowRight size={12} color={C.muted} />
              <span style={{ color: C.text, fontWeight: 600 }}>{c.new_model_id || '—'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>{relative(c.recorded_at)}</span>
            </div>
          ))}
        </UI.Card>
      )}
    </GraphPageShell>
  );
}

function HealthPill({ ok, okText, warnText }: { ok: boolean; okText: string; warnText: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      color: ok ? '#15803d' : '#b45309',
      background: ok ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
    }}>
      {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {ok ? okText : warnText}
    </div>
  );
}

function SectionBar({ title, count, tone }: { title: string; count: number; tone: 'ok' | 'warn' | 'neutral' }) {
  const color = tone === 'warn' ? '#b45309' : C.muted;
  return (
    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(106,126,138,0.04)' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color }}>{title}</span>
      <span style={{ fontSize: 11, color: C.dim }}>· {count}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>{children}</td>;
}
function Badge({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  const ok = tone === 'ok';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
      color: ok ? '#15803d' : '#b45309',
      background: ok ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)',
    }}>{children}</span>
  );
}
