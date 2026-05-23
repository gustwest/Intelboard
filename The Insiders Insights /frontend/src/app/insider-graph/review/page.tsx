'use client';

import { useEffect, useState } from 'react';
import { Inbox, Check, X, Mail, Calendar, Award, FileText, AlertCircle } from 'lucide-react';
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

const TYPE_ICON: Record<string, any> = {
  Event: Calendar,
  Award: Award,
  NewsArticle: FileText,
  PodcastEpisode: Mail,
};

export default function GraphReviewPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients[0]) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function load(clientId: string) {
    setError(null);
    setItems(null);
    try {
      const data = await graphFetch<{ items: ReviewItem[] }>(`/api/review/${clientId}`);
      setItems(data.items);
    } catch (e: any) {
      setError(e.message);
      setItems([]);
    }
  }

  useEffect(() => {
    if (selected) load(selected);
  }, [selected]);

  async function decide(item: ReviewItem, decision: 'approve' | 'reject') {
    if (!selected) return;
    setBusyId(item.id);
    try {
      await graphFetch(`/api/review/${selected}/${item.employee_id}/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <GraphPageShell
      title="Granska inkommande"
      icon={<Inbox size={22} />}
      subtitle="Items från LLM-extraktion med låg confidence — godkänn för att inkludera i JSON-LD."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Kund:</label>
        <select
          value={selected || ''}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            padding: '8px 12px',
            background: '#eef0f1',
            color: '#3a4b56',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
          }}
        >
          {clients.length === 0 && <option>Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#fca5a5', fontSize: 12, marginBottom: 16, display: 'flex', gap: 8 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {items === null ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Laddar…
        </div>
      ) : items.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <Inbox size={32} color={C.dim} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: '#3a4b56', fontWeight: 600 }}>Inget att granska</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            Alla inkommande mail har confidence ≥ 0,7 eller är redan beslutade.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            const Icon = TYPE_ICON[item.schema_type] || FileText;
            return (
              <div
                key={item.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: '18px 22px',
                  opacity: busyId === item.id ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(159,81,182,0.15)', color: '#9f51b6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56' }}>{item.name || '(utan titel)'}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {item.schema_type} · {item.employee_name || item.employee_id}
                        {item.start_date && ` · ${item.start_date}`}
                        {item.organizer && ` · ${item.organizer}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>
                      conf {item.confidence != null ? item.confidence.toFixed(2) : '?'}
                    </span>
                    <button
                      onClick={() => decide(item, 'approve')}
                      disabled={busyId === item.id}
                      title="Godkänn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        background: 'rgba(34,197,94,0.15)',
                        color: '#86efac',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Check size={12} /> Godkänn
                    </button>
                    <button
                      onClick={() => decide(item, 'reject')}
                      disabled={busyId === item.id}
                      title="Avvisa"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#fca5a5',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <X size={12} /> Avvisa
                    </button>
                  </div>
                </div>

                {(item.subject || item.from_email) && (
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                    <strong style={{ color: '#3a4b56' }}>{item.subject || '(utan ämne)'}</strong>
                    {item.from_email && <span> · från {item.from_email}</span>}
                  </div>
                )}

                {item.content && (
                  <div style={{ fontSize: 12, color: '#3a4b56', background: '#eef0f1', padding: '10px 14px', borderRadius: 6, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {item.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GraphPageShell>
  );
}
