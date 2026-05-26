'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Check, X, Mail, Calendar, Award, FileText, AlertCircle, Quote } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type Client = { client_id: string; company_name: string | null };

type ReviewItem = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  schema_type: string;
  name: string | null;
  content: string | null;
  url: string | null;
  from_email: string | null;
  subject: string | null;
  confidence: number | null;
  start_date: string | null;
  organizer: string | null;
  published_at: string | null;
  created_at: string | null;
};

type ClaimSource = { kind: string; item_id?: string | null; label?: string | null };
type ClaimItem = {
  id: string;
  claim_kind: string;
  statement: string | null;
  predicate: string | null;
  value: unknown;
  confidence: number | null;
  source: ClaimSource[];
  created_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
};

type Tab = 'items' | 'claims';

const TYPE_ICON: Record<string, typeof FileText> = {
  Event: Calendar,
  Award: Award,
  NewsArticle: FileText,
  PodcastEpisode: Mail,
};

export default function GraphReviewPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('claims');
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [claims, setClaims] = useState<ClaimItem[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Godkända claims stannar kvar i vyn med en valideringsnotis (id → godkänt-tid).
  const [approved, setApproved] = useState<Record<string, string>>({});

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients[0]) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (clientId: string, which: Tab) => {
    setError(null);
    try {
      if (which === 'items') {
        setItems(null);
        const data = await graphFetch<{ items: ReviewItem[] }>(`/api/review/${clientId}`);
        setItems(data.items);
      } else {
        setClaims(null);
        const data = await graphFetch<{ items: ClaimItem[] }>(`/api/review/${clientId}/claims`);
        setClaims(data.items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (which === 'items') setItems([]);
      else setClaims([]);
    }
  }, []);

  useEffect(() => {
    if (selected) load(selected, tab);
  }, [selected, tab, load]);

  async function decideItem(item: ReviewItem, decision: 'approve' | 'reject') {
    if (!selected) return;
    setBusyId(item.id);
    try {
      await graphFetch(`/api/review/${selected}/${item.employee_id}/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function decideClaim(claim: ClaimItem, decision: 'approve' | 'reject') {
    if (!selected) return;
    setBusyId(claim.id);
    const edited = edits[claim.id];
    const body: Record<string, unknown> = { decision };
    if (decision === 'approve' && edited != null && edited !== claim.statement) {
      body.statement = edited;
    }
    try {
      await graphFetch(`/api/review/${selected}/claims/${claim.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (decision === 'approve') {
        // Stanna kvar med en valideringsnotis i stället för att försvinna.
        setApproved((prev) => ({ ...prev, [claim.id]: new Date().toISOString() }));
      } else {
        setClaims((prev) => (prev ? prev.filter((c) => c.id !== claim.id) : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <GraphPageShell
      title="Granska inkommande"
      icon={<Inbox size={22} />}
      subtitle="Lågt-confidence extraktioner — godkänn (ev. efter redigering) för att inkludera i JSON-LD."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Kund:</label>
        <select value={selected || ''} onChange={(e) => setSelected(e.target.value)} style={selectStyle}>
          {clients.length === 0 && <option>Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>

        <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
          {([['claims', 'Claims'], ['items', 'Mail-items']] as [Tab, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: tab === v ? 'rgba(159,81,182,0.18)' : '#eef0f1',
                color: tab === v ? '#9f51b6' : '#3a4b56',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#b91c1c', fontSize: 12, marginBottom: 16, display: 'flex', gap: 8 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {tab === 'items' ? renderItems() : renderClaims()}
    </GraphPageShell>
  );

  function renderItems() {
    if (items === null) return <Loading />;
    if (items.length === 0) return <Empty hint="Alla inkommande mail har confidence ≥ 0,7 eller är redan beslutade." />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => {
          const Icon = TYPE_ICON[item.schema_type] || FileText;
          return (
            <div key={item.id} style={{ ...cardStyle, opacity: busyId === item.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                  <IconBox><Icon size={16} /></IconBox>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56' }}>{item.name || '(utan titel)'}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {item.schema_type} · {item.employee_name || item.employee_id}
                      {item.start_date && ` · ${item.start_date}`}
                      {item.organizer && ` · ${item.organizer}`}
                    </div>
                  </div>
                </div>
                <Actions confidence={item.confidence} busy={busyId === item.id} onApprove={() => decideItem(item, 'approve')} onReject={() => decideItem(item, 'reject')} />
              </div>
              {(item.subject || item.from_email) && (
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  <strong style={{ color: '#3a4b56' }}>{item.subject || '(utan ämne)'}</strong>
                  {item.from_email && <span> · från {item.from_email}</span>}
                </div>
              )}
              {item.content && <div style={contentStyle}>{item.content}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  function renderClaims() {
    if (claims === null) return <Loading />;
    if (claims.length === 0) return <Empty hint="Inga claims väntar på granskning — alla har confidence ≥ 0,7 eller är redan beslutade." />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {claims.map((claim) => {
          const sourceLabel = claim.source.map((s) => (s.kind === 'manual' ? s.label || 'manuell' : 'källa')).join(', ') || 'ingen källa';
          const text = edits[claim.id] ?? claim.statement ?? '';
          const isProperty = claim.claim_kind === 'property';
          const approvedAt = approved[claim.id];
          const validatedTs = claim.validated_at ?? approvedAt ?? null;
          const validatedBy = claim.validated_by ?? (approvedAt ? 'granskare (manuellt godkänd)' : null);
          return (
            <div key={claim.id} style={{ ...cardStyle, opacity: busyId === claim.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                  <IconBox><Quote size={16} /></IconBox>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {isProperty ? `Property · ${claim.predicate}` : 'Narrative'} · {sourceLabel}
                    </div>
                    {validatedTs && (
                      <div style={{ fontSize: 11, color: '#3a7d44', marginTop: 2 }}>
                        ✓ Validerad {new Date(validatedTs).toLocaleDateString('sv-SE')}
                        {validatedBy ? ` · ${validatedBy}` : ''}
                      </div>
                    )}
                  </div>
                </div>
                {approvedAt ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#3a7d44', whiteSpace: 'nowrap' }}>✓ Godkänd</span>
                ) : (
                  <Actions confidence={claim.confidence} busy={busyId === claim.id} onApprove={() => decideClaim(claim, 'approve')} onReject={() => decideClaim(claim, 'reject')} />
                )}
              </div>
              {isProperty ? (
                <div style={contentStyle}>{String(claim.value)}</div>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 13,
                    color: '#3a4b56',
                    background: '#eef0f1',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: '10px 14px',
                    lineHeight: 1.55,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }
}

/* --- delade småkomponenter --- */

function Loading() {
  return <div style={{ ...cardStyle, padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Laddar…</div>;
}

function Empty({ hint }: { hint: string }) {
  return (
    <div style={{ ...cardStyle, padding: '48px 24px', textAlign: 'center' }}>
      <Inbox size={32} color={C.dim} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 14, color: '#3a4b56', fontWeight: 600 }}>Inget att granska</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{hint}</div>
    </div>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(159,81,182,0.15)', color: '#9f51b6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {children}
    </div>
  );
}

function Actions({ confidence, busy, onApprove, onReject }: { confidence: number | null; busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#b45309', fontWeight: 600 }}>
        conf {confidence != null ? confidence.toFixed(2) : '?'}
      </span>
      <button onClick={onApprove} disabled={busy} title="Godkänn" style={approveBtn}>
        <Check size={12} /> Godkänn
      </button>
      <button onClick={onReject} disabled={busy} title="Avvisa" style={rejectBtn}>
        <X size={12} /> Avvisa
      </button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#eef0f1',
  color: '#3a4b56',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
};

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '18px 22px',
};

const contentStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#3a4b56',
  background: '#eef0f1',
  padding: '10px 14px',
  borderRadius: 6,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
};

const approveBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  background: 'rgba(34,197,94,0.15)',
  color: '#16a34a',
  border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const rejectBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  background: 'rgba(239,68,68,0.1)',
  color: '#b91c1c',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
