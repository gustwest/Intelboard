'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, ArrowLeft, Trash2, X, AlertCircle, ExternalLink } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../../_components/GraphPageShell';
import AttestedUpload from '../../_components/AttestedUpload';
import ESGAddon from '../../_components/ESGAddon';
import { graphFetch } from '../../_lib/api';

type Employee = {
  employee_id: string;
  name: string | null;
  title: string | null;
  linkedin_url: string | null;
  node_type: string | null;
  gender: string | null;
  opted_out: boolean;
  email_ingestion_addr: string | null;
};

type ClientDetail = {
  client_id: string;
  company_name: string | null;
  company_linkedin_url: string | null;
  active_connectors: string[];
  cdn_url: string | null;
  profile_url: string | null;
  tier: string;
  profile_base_url: string | null;
  last_compiled: string | null;
  employees: Employee[];
};

const NODE_COLORS: Record<string, string> = { aktiv: '#22c55e', episodisk: '#f59e0b', passiv: '#6a7e8a' };

export default function ClientDetailPage() {
  const params = useParams<{ client_id: string }>();
  const clientId = params.client_id;
  const router = useRouter();

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: 'client'; name: string }
    | { kind: 'employee'; id: string; name: string }
    | null
  >(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await graphFetch<ClientDetail>(`/api/clients/${clientId}`);
      setClient(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleOptOut(emp: Employee) {
    setBusy(emp.employee_id);
    try {
      await graphFetch(`/api/clients/${clientId}/employees/${emp.employee_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opted_out: !emp.opted_out }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteEmployee(id: string) {
    setBusy(id);
    try {
      await graphFetch(`/api/clients/${clientId}/employees/${id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteClient() {
    setBusy('client');
    try {
      await graphFetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      router.push('/insider-graph/kunder');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <GraphPageShell
      title={client?.company_name || clientId}
      icon={<Users size={22} />}
      subtitle="Hantera medarbetare, opt-out och radering för den här kunden."
    >
      <Link
        href="/insider-graph/kunder"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Alla kunder
      </Link>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#fca5a5', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {client === null ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Laddar…
        </div>
      ) : (
        <>
          {/* Företagsöversikt */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: C.muted }}>
              <Row label="client_id" value={client.client_id} mono />
              <Row label="Tier" value={client.tier} />
              <Row label="Connectors" value={client.active_connectors.join(', ') || '—'} />
              {client.company_linkedin_url && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>LinkedIn</span>
                  <a href={client.company_linkedin_url} target="_blank" rel="noreferrer" style={{ color: '#9f51b6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Företagssida <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* AI-synlighet — ESG & CSRD Perception Audit (valbart tillägg, per kund) */}
          <ESGAddon clientId={clientId} />

          {/* Officiell attesterad data (uppladdning) */}
          <AttestedUpload clientId={clientId} />

          {/* Medarbetare */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', marginBottom: 14 }}>
              Medarbetare ({client.employees.length})
            </div>
            {client.employees.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>Inga medarbetare.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {client.employees.map((emp) => (
                  <div
                    key={emp.employee_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      opacity: emp.opted_out ? 0.6 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {emp.name || emp.employee_id}
                        {emp.node_type && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: `${NODE_COLORS[emp.node_type] || C.muted}22`, color: NODE_COLORS[emp.node_type] || C.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                            {emp.node_type}
                          </span>
                        )}
                        {emp.opted_out && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>
                            opt-out
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {emp.title || '—'}
                        {emp.linkedin_url && (
                          <>
                            {' · '}
                            <a href={emp.linkedin_url} target="_blank" rel="noreferrer" style={{ color: '#9f51b6' }}>LinkedIn</a>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleOptOut(emp)}
                        disabled={busy === emp.employee_id}
                        style={{
                          padding: '5px 10px',
                          background: emp.opted_out ? 'rgba(34,197,94,0.12)' : 'transparent',
                          color: emp.opted_out ? '#16a34a' : C.muted,
                          border: `1px solid ${emp.opted_out ? 'rgba(34,197,94,0.3)' : C.border}`,
                          borderRadius: 7,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: busy === emp.employee_id ? 'wait' : 'pointer',
                        }}
                      >
                        {emp.opted_out ? 'Återuppta hämtning' : 'Opt out'}
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: 'employee', id: emp.employee_id, name: emp.name || emp.employee_id })}
                        title="Radera all data om personen"
                        style={{ padding: '5px 8px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, cursor: 'pointer', display: 'flex' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Farozon */}
          <div style={{ border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '18px 20px', background: 'rgba(239,68,68,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>Radera kund</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Tar bort kunden med alla medarbetare, connectors, insamlad data och claims. Går inte att ångra.
            </div>
            <button
              onClick={() => setConfirm({ kind: 'client', name: client.company_name || client.client_id })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Trash2 size={14} /> Radera kund
            </button>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDeleteModal
          title={confirm.kind === 'client' ? 'Radera kund' : 'Radera all data om personen'}
          description={
            confirm.kind === 'client'
              ? 'Detta raderar kunden och ALL kopplad data permanent. Skriv kundens namn för att bekräfta.'
              : 'Detta raderar medarbetaren, all insamlad data och claims som refererar personen. Skriv personens namn för att bekräfta.'
          }
          expected={confirm.name}
          busy={busy !== null}
          onCancel={() => setConfirm(null)}
          onConfirm={() => (confirm.kind === 'client' ? deleteClient() : deleteEmployee(confirm.id))}
        />
      )}
    </GraphPageShell>
  );
}

function ConfirmDeleteModal({
  title,
  description,
  expected,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  expected: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const match = typed.trim() === expected.trim();
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 14, width: '100%', maxWidth: 460, padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} /> {title}
          </h2>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#3a4b56', lineHeight: 1.6, margin: '0 0 14px' }}>{description}</p>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
          Skriv <strong style={{ color: '#3a4b56' }}>{expected}</strong> för att bekräfta:
        </div>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          style={{ display: 'block', width: '100%', padding: '8px 12px', background: '#eef0f1', color: '#3a4b56', border: '1px solid #dfe3e7', borderRadius: 6, fontSize: 13, outline: 'none', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 14px', background: 'transparent', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={!match || busy}
            style={{
              padding: '8px 14px',
              background: match ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.2)',
              color: match ? '#fff' : '#fca5a5',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: match && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Raderar…' : 'Radera permanent'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: '#3a4b56', fontFamily: mono ? 'ui-monospace, monospace' : undefined }}>{value}</span>
    </div>
  );
}
