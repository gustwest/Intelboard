'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, CheckCircle2, AlertTriangle, AlertOctagon, Info, RefreshCw, Settings, ExternalLink, Check } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch } from '../_lib/api';

type SetupStatus = {
  webhook_token_configured: boolean;
  budget_source_acked: boolean;
  budget_source_acked_at: string | null;
  budget_source_acked_by: string | null;
};

type Alert = {
  id: string;
  kind: string;
  source: string;
  title: string;
  detail: string | null;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acked' | 'resolved';
  client_id: string | null;
  occurrence_count: number;
  reopen_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_message: string | null;
  ack_by: string | null;
  ack_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

type Resp = { alerts: Alert[]; total: number; open_count?: number };

const KIND_LABEL: Record<string, string> = {
  job_failed: 'Jobb-failure',
  budget_threshold: 'Budget-tröskel',
  llm_engine_down: 'LLM-motor nere',
  model_drift: 'Modelldrift',
  uptime: 'Uptime',
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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'acked' | 'resolved' | 'all'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [busySetup, setBusySetup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setRefreshing(true);
    graphFetch<Resp>(`/api/ops/alerts?status=${filter}`)
      .then((d) => setAlerts(d.alerts))
      .catch((e) => {
        setAlerts([]);
        setError(e.message || 'Kunde inte hämta alerts');
      })
      .finally(() => setRefreshing(false));
  }, [filter]);

  const loadSetup = useCallback(() => {
    graphFetch<SetupStatus>('/api/ops/setup-status')
      .then(setSetup)
      .catch(() => setSetup(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSetup();
  }, [loadSetup]);

  const ackBudget = async () => {
    setBusySetup(true);
    try {
      await graphFetch('/api/ops/setup-status/ack-budget-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'ops' }),
      });
      loadSetup();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte kvittera setup');
    } finally {
      setBusySetup(false);
    }
  };

  const act = async (id: string, action: 'ack' | 'resolve') => {
    setBusyId(id);
    try {
      await graphFetch(`/api/ops/alerts/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'ops' }),
      });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `${action} failade`);
    } finally {
      setBusyId(null);
    }
  };

  const counts = countByStatus(alerts);

  return (
    <GraphPageShell
      title="Drift-larm"
      icon={<Bell size={22} />}
      subtitle="System-interna notiser för jobb-failures, budget-trösklar och liknande. Lyckade körningar auto-stänger."
    >
      <SetupBanner setup={setup} busy={busySetup} onAck={ackBudget} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <UI.SegmentedToggle
          value={filter}
          onChange={setFilter}
          options={(['open', 'acked', 'resolved', 'all'] as const).map((s) => ({
            value: s,
            label: `${labelForStatus(s)}${counts && counts[s] !== undefined ? ` (${counts[s]})` : ''}`,
          }))}
        />
        <button
          onClick={load}
          title="Ladda om"
          disabled={refreshing}
          style={{
            marginLeft: 'auto',
            padding: '6px 8px',
            border: `1px solid ${C.border}`,
            background: C.card,
            borderRadius: 6,
            cursor: refreshing ? 'wait' : 'pointer',
            color: C.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
        >
          <RefreshCw size={12} className={refreshing ? 'spin' : undefined} /> Uppdatera
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 0.8s linear infinite; transform-origin: center }`}</style>

      {error && (
        <UI.StatusBanner tone="err" style={{ marginBottom: 16 }}>{error}</UI.StatusBanner>
      )}

      <UI.Card padding={alerts && alerts.length > 0 ? '0' : '32px 22px'}>
        {alerts === null ? (
          <Empty text="Laddar…" />
        ) : alerts.length === 0 ? (
          <Empty
            text={
              filter === 'open'
                ? 'Inga öppna larm — fint där 🎉'
                : `Inga ${labelForStatus(filter).toLowerCase()} larm`
            }
          />
        ) : (
          <div>
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} busy={busyId === a.id} onAct={act} />
            ))}
          </div>
        )}
      </UI.Card>
    </GraphPageShell>
  );
}

function AlertRow({
  alert,
  busy,
  onAct,
}: {
  alert: Alert;
  busy: boolean;
  onAct: (id: string, action: 'ack' | 'resolve') => void;
}) {
  const sev = severityStyle(alert.severity);
  return (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>{sev.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <UI.Badge tone={alert.severity === 'critical' ? 'err' : alert.severity === 'warning' ? 'warn' : 'info'}>
            {alert.severity}
          </UI.Badge>
          <span style={{ fontSize: 11, color: C.dim }}>{KIND_LABEL[alert.kind] || alert.kind}</span>
          {alert.status === 'acked' && (
            <span style={{ fontSize: 11, color: '#6366f1' }}>
              ackad av {alert.ack_by || '?'} {alert.ack_at && `· ${relative(alert.ack_at)}`}
            </span>
          )}
          {alert.status === 'resolved' && (
            <span style={{ fontSize: 11, color: '#22c55e' }}>
              löst {alert.resolved_at && `· ${relative(alert.resolved_at)}`}
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginTop: 4 }}>
          {alert.title}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {alert.source}
          {alert.client_id && alert.client_id !== alert.source && (
            <> · kund: <span style={{ color: C.text }}>{alert.client_id}</span></>
          )}
        </div>
        {alert.last_message && (
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              marginTop: 6,
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.025)',
              borderRadius: 6,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              wordBreak: 'break-word',
              maxHeight: 80,
              overflow: 'hidden',
            }}
          >
            {alert.last_message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.dim, marginTop: 8, flexWrap: 'wrap' }}>
          <span>Senast: {relative(alert.last_seen_at)}</span>
          {alert.occurrence_count > 1 && <span>{alert.occurrence_count} förekomster</span>}
          {alert.reopen_count > 0 && (
            <span style={{ color: '#d97706' }}>Återkommit {alert.reopen_count} {alert.reopen_count === 1 ? 'gång' : 'gånger'}</span>
          )}
        </div>
      </div>
      {alert.status !== 'resolved' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {alert.status === 'open' && (
            <button
              onClick={() => onAct(alert.id, 'ack')}
              disabled={busy}
              style={btn('ghost')}
              title="Markera 'någon tar tag i detta' — försvinner inte ur listan"
            >
              Acka
            </button>
          )}
          <button
            onClick={() => onAct(alert.id, 'resolve')}
            disabled={busy}
            style={btn('primary')}
            title="Markera löst — försvinner ur listan, återkommer auto om problemet kommer tillbaka"
          >
            Resolva
          </button>
        </div>
      )}
    </div>
  );
}

function btn(variant: 'primary' | 'ghost'): React.CSSProperties {
  const primary = variant === 'primary';
  return {
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 6,
    border: `1px solid ${primary ? C.accent : C.border}`,
    background: primary ? C.accent : C.card,
    color: primary ? '#fff' : C.text,
    cursor: 'pointer',
    minWidth: 70,
  };
}

function severityStyle(s: Alert['severity']) {
  if (s === 'critical') {
    return {
      icon: <AlertOctagon size={18} color="#ef4444" />,
      bg: 'rgba(239,68,68,0.12)',
      fg: '#b91c1c',
    };
  }
  if (s === 'warning') {
    return {
      icon: <AlertTriangle size={18} color="#f59e0b" />,
      bg: 'rgba(245,158,11,0.14)',
      fg: '#b45309',
    };
  }
  return {
    icon: <Info size={18} color="#3b82f6" />,
    bg: 'rgba(59,130,246,0.12)',
    fg: '#1d4ed8',
  };
}

function labelForStatus(s: 'open' | 'acked' | 'resolved' | 'all'): string {
  if (s === 'open') return 'Öppna';
  if (s === 'acked') return 'Ackade';
  if (s === 'resolved') return 'Lösta';
  return 'Alla';
}

function countByStatus(alerts: Alert[] | null): Record<string, number> | null {
  if (!alerts) return null;
  const out: Record<string, number> = { open: 0, acked: 0, resolved: 0, all: alerts.length };
  for (const a of alerts) out[a.status] = (out[a.status] || 0) + 1;
  return out;
}

function Empty({ text }: { text: string }) {
  return (
    <UI.Empty icon={<CheckCircle2 size={20} />} style={{ padding: '24px 4px' }}>
      {text}
    </UI.Empty>
  );
}

function SetupBanner({
  setup,
  busy,
  onAck,
}: {
  setup: SetupStatus | null;
  busy: boolean;
  onAck: () => void;
}) {
  if (!setup) return null;
  const tokenOk = setup.webhook_token_configured;
  const budgetOk = setup.budget_source_acked;
  if (tokenOk && budgetOk) return null;

  return (
    <div
      style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 10,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <Settings size={18} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#b45309', marginBottom: 6 }}>
          Setup av budget-alerts ej klar
        </div>
        <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>
          Jobb-failures fungerar redan (auto-öppnas av drift-loopen). Budget-alerts
          från Cloud Billing kräver ytterligare konfiguration:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <SetupRow ok={tokenOk} label="OPS_WEBHOOK_TOKEN konfigurerad på Cloud Run">
            {!tokenOk && (
              <span style={{ color: C.muted, fontSize: 11 }}>
                Kör <code style={code}>scripts/setup-ops-webhook.sh</code> i
                insider-graph-api-projektet — genererar token och uppdaterar service-env.
              </span>
            )}
          </SetupRow>
          <SetupRow ok={budgetOk} label="Cloud Billing → Pub/Sub-koppling kvitterad">
            {!budgetOk && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>
                  Manuellt steg i Cloud Console: Billing → Budgets → välj din budget
                  → Manage notifications → Connect a Pub/Sub topic → välj{' '}
                  <code style={code}>ops-budget-alerts</code>.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <a
                    href="https://console.cloud.google.com/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: C.accent,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Öppna Cloud Console <ExternalLink size={11} />
                  </a>
                  <button
                    onClick={onAck}
                    disabled={busy}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: `1px solid ${C.accent}`,
                      background: C.accent,
                      color: '#fff',
                      cursor: busy ? 'wait' : 'pointer',
                    }}
                  >
                    {busy ? 'Sparar…' : 'Markera som klar'}
                  </button>
                </div>
              </div>
            )}
          </SetupRow>
        </div>
      </div>
    </div>
  );
}

function SetupRow({
  ok,
  label,
  children,
}: {
  ok: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: ok ? '#22c55e' : '#d1d5db',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {ok && <Check size={9} color="#fff" strokeWidth={3} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: ok ? C.muted : C.text, fontWeight: ok ? 400 : 500 }}>{label}</div>
        {children}
      </div>
    </div>
  );
}

const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 11,
  padding: '1px 5px',
  background: 'rgba(0,0,0,0.05)',
  borderRadius: 3,
};
