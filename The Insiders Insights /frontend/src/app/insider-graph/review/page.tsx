'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Check, X, Mail, Calendar, Award, FileText, AlertCircle, Quote, Network } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import * as UI from '../_components/ui';
import { graphFetch, graphFetchBlob } from '../_lib/api';

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
  // Sätts bara i "Alla kunder"-läget (cross-client-kö) så vi vet vart beslutet går.
  client_id?: string;
  company_name?: string | null;
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
  client_id?: string;
  company_name?: string | null;
};

type Snapshot = {
  id: string;
  skills: string[];
  followers: number | null;
  quarter: string | null;
  filename: string | null;
  has_file: boolean;
  uploaded_at: string | null;
  client_id?: string;
  company_name?: string | null;
};

type Tab = 'items' | 'claims' | 'linkedin';

const ALL = 'all';

type InboxClientLite = { client_id: string; company_name: string | null; counts: Record<string, number> };

const TYPE_ICON: Record<string, typeof FileText> = {
  Event: Calendar,
  Award: Award,
  NewsArticle: FileText,
  PodcastEpisode: Mail,
};

// "Alla kunder"-kö: läs inkorgen (redan filtrerad till kunder med väntande poster),
// hämta de relevanta kundernas listor parallellt och tagga varje post med dess kund.
async function fetchAllForTab(which: Tab): Promise<Array<Record<string, unknown> & { client_id: string; company_name: string | null }>> {
  const inbox = await graphFetch<{ clients: InboxClientLite[] }>('/api/inbox');
  const relevant = inbox.clients.filter((c) => (c.counts?.[which] || 0) > 0);
  const key = which === 'linkedin' ? 'snapshots' : 'items';
  const lists = await Promise.all(
    relevant.map(async (c) => {
      const path =
        which === 'items'
          ? `/api/review/${c.client_id}`
          : which === 'linkedin'
            ? `/api/review/${c.client_id}/linkedin`
            : `/api/review/${c.client_id}/claims`;
      const data = await graphFetch<Record<string, Record<string, unknown>[]>>(path);
      const arr = data[key] || [];
      return arr.map((x) => ({ ...x, client_id: c.client_id, company_name: c.company_name }));
    }),
  );
  return lists.flat();
}

// Gruppera poster per kund för cross-client-vyn (bevarar inkommande ordning).
function groupByClient<T extends { id: string; client_id?: string; company_name?: string | null }>(
  arr: T[],
): Array<{ clientId: string; name: string | null; items: T[] }> {
  const map = new Map<string, { clientId: string; name: string | null; items: T[] }>();
  for (const x of arr) {
    const cid = x.client_id || 'okänd';
    if (!map.has(cid)) map.set(cid, { clientId: cid, name: x.company_name ?? cid, items: [] });
    map.get(cid)!.items.push(x);
  }
  return [...map.values()];
}

export default function GraphReviewPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [tab, setTab] = useState<Tab>('claims');
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [claims, setClaims] = useState<ClaimItem[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // LinkedIn-snapshot: redigerbar kompetenslista (komma-/radseparerad) före godkännande.
  const [skillEdits, setSkillEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Godkända claims stannar kvar i vyn med en valideringsnotis (id → godkänt-tid).
  const [approved, setApproved] = useState<Record<string, string>>({});
  // Flik-räknare: bas från inkorgen + lokalt avklarade per kund (beräknas i render,
  // så vi slipper härleda state i en effekt).
  const [inboxByClient, setInboxByClient] = useState<Record<string, { claims: number; items: number; linkedin: number }>>({});
  const [resolved, setResolved] = useState<Record<string, { claims: number; items: number; linkedin: number }>>({});

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => setClients(d.clients))
      .catch((e) => setError(e.message));
  }, []);

  // Deep-link: ?client=<id>&tab=<claims|items|linkedin> (t.ex. från kundkortet).
  // Läser window.location för att slippa useSearchParams Suspense-kravet.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get('client');
    const t = sp.get('tab');
    if (c) setSelected(c);
    if (t === 'claims' || t === 'items' || t === 'linkedin') setTab(t);
  }, []);

  // Bas-räknare per kund från inkorgen (en hämtning).
  useEffect(() => {
    graphFetch<{ clients: { client_id: string; counts: { claims: number; items: number; linkedin: number } }[] }>('/api/inbox')
      .then((d) => {
        const map: Record<string, { claims: number; items: number; linkedin: number }> = {};
        for (const c of d.clients) map[c.client_id] = { claims: c.counts.claims, items: c.counts.items, linkedin: c.counts.linkedin };
        setInboxByClient(map);
      })
      .catch(() => {});
  }, []);

  // En avklarad post (godkänd/avvisad) drar ner räknaren för fliken, per kund.
  function bumpResolved(key: 'claims' | 'items' | 'linkedin', clientId: string) {
    setResolved((p) => {
      const cur = p[clientId] || { claims: 0, items: 0, linkedin: 0 };
      return { ...p, [clientId]: { ...cur, [key]: cur[key] + 1 } };
    });
  }

  const tabCount = (k: 'claims' | 'items' | 'linkedin'): number => {
    const countFor = (cid: string) =>
      Math.max(0, (inboxByClient[cid]?.[k] || 0) - (resolved[cid]?.[k] || 0));
    if (selected === ALL) {
      return Object.keys(inboxByClient).reduce((sum, cid) => sum + countFor(cid), 0);
    }
    return countFor(selected);
  };

  const load = useCallback(async (clientId: string, which: Tab) => {
    setError(null);
    const all = clientId === ALL;
    try {
      if (which === 'items') {
        setItems(null);
        if (all) setItems((await fetchAllForTab('items')) as unknown as ReviewItem[]);
        else setItems((await graphFetch<{ items: ReviewItem[] }>(`/api/review/${clientId}`)).items);
      } else if (which === 'linkedin') {
        setSnapshots(null);
        if (all) setSnapshots((await fetchAllForTab('linkedin')) as unknown as Snapshot[]);
        else setSnapshots((await graphFetch<{ snapshots: Snapshot[] }>(`/api/review/${clientId}/linkedin`)).snapshots);
      } else {
        setClaims(null);
        if (all) setClaims((await fetchAllForTab('claims')) as unknown as ClaimItem[]);
        else setClaims((await graphFetch<{ items: ClaimItem[] }>(`/api/review/${clientId}/claims`)).items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (which === 'items') setItems([]);
      else if (which === 'linkedin') setSnapshots([]);
      else setClaims([]);
    }
  }, []);

  useEffect(() => {
    if (selected) load(selected, tab);
  }, [selected, tab, load]);

  async function decideItem(item: ReviewItem, decision: 'approve' | 'reject') {
    const cid = item.client_id ?? (selected === ALL ? null : selected);
    if (!cid) return;
    setBusyId(item.id);
    try {
      await graphFetch(`/api/review/${cid}/${item.employee_id}/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setItems((prev) => (prev ? prev.filter((i) => !(i.id === item.id && i.client_id === item.client_id)) : prev));
      bumpResolved('items', cid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function decideClaim(claim: ClaimItem, decision: 'approve' | 'reject') {
    const cid = claim.client_id ?? (selected === ALL ? null : selected);
    if (!cid) return;
    setBusyId(claim.id);
    const edited = edits[claim.id];
    const body: Record<string, unknown> = { decision };
    if (decision === 'approve' && edited != null && edited !== claim.statement) {
      body.statement = edited;
    }
    try {
      await graphFetch(`/api/review/${cid}/claims/${claim.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (decision === 'approve') {
        // Stanna kvar med en valideringsnotis i stället för att försvinna.
        setApproved((prev) => ({ ...prev, [claim.id]: new Date().toISOString() }));
      } else {
        setClaims((prev) => (prev ? prev.filter((c) => !(c.id === claim.id && c.client_id === claim.client_id)) : prev));
      }
      bumpResolved('claims', cid); // både godkänt och avvisat löser needs_review
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function decideSnapshot(snap: Snapshot, decision: 'approve' | 'reject') {
    const cid = snap.client_id ?? (selected === ALL ? null : selected);
    if (!cid) return;
    setBusyId(snap.id);
    const body: Record<string, unknown> = { decision };
    if (decision === 'approve') {
      const edited = skillEdits[snap.id];
      const skills = (edited ?? snap.skills.join(', '))
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      body.skills = skills;
    }
    try {
      await graphFetch(`/api/review/${cid}/linkedin/${snap.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSnapshots((prev) => (prev ? prev.filter((s) => !(s.id === snap.id && s.client_id === snap.client_id)) : prev));
      bumpResolved('linkedin', cid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function viewFile(snap: Snapshot) {
    const cid = snap.client_id ?? (selected === ALL ? null : selected);
    if (!cid) return;
    try {
      const blob = await graphFetchBlob(`/api/linkedin/${cid}/snapshots/${snap.id}/file`);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={selectStyle}>
          <option value={ALL}>Alla kunder</option>
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>

        <UI.SegmentedToggle
          value={tab}
          onChange={setTab}
          style={{ marginLeft: 'auto' }}
          options={([['claims', 'Claims'], ['items', 'Mail-items'], ['linkedin', 'LinkedIn']] as [Tab, string][]).map(([v, label]) => {
            const n = tabCount(v);
            return {
              value: v,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {label}
                  {n > 0 && <UI.Pill style={{ minWidth: 0, fontSize: 10 }}>{n}</UI.Pill>}
                </span>
              ),
            };
          })}
        />
      </div>

      {error && (
        <UI.StatusBanner tone="err" icon={<AlertCircle size={14} />} style={{ marginBottom: 16 }}>
          {error}
        </UI.StatusBanner>
      )}

      {tab === 'items' ? renderItems() : tab === 'linkedin' ? renderLinkedIn() : renderClaims()}
    </GraphPageShell>
  );

  function renderLinkedIn() {
    if (snapshots === null) return <Loading />;
    if (snapshots.length === 0)
      return <Empty hint="Inga LinkedIn-snapshots väntar på verifiering. Kunden laddar upp sin kvartalsdata under fliken LinkedIn." />;
    const groups = selected === ALL ? groupByClient(snapshots) : [{ clientId: 'one', name: null, items: snapshots }];
    return (
      <GroupedList groups={groups}>
        {(snap) => {
          const skillText = skillEdits[snap.id] ?? snap.skills.join(', ');
          return (
            <UI.Card key={snap.id} padding="18px 22px" style={{ opacity: busyId === snap.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                  <IconBox><Network size={16} /></IconBox>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                      {snap.quarter || 'LinkedIn-kapacitetsdata'}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {snap.filename ? `${snap.filename} · ` : ''}
                      {snap.followers != null ? `${snap.followers.toLocaleString('sv-SE')} följare · ` : ''}
                      {snap.uploaded_at ? new Date(snap.uploaded_at).toLocaleDateString('sv-SE') : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {snap.has_file && (
                    <button onClick={() => viewFile(snap)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <FileText size={12} /> Visa underlag
                    </button>
                  )}
                  <button onClick={() => decideSnapshot(snap, 'approve')} disabled={busyId === snap.id} style={approveBtn}>
                    <Check size={12} /> Verifiera
                  </button>
                  <button onClick={() => decideSnapshot(snap, 'reject')} disabled={busyId === snap.id} style={rejectBtn}>
                    <X size={12} /> Avvisa
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                Aggregerade kompetenser (redigera vid behov före verifiering — komma-/radseparerade):
              </div>
              <textarea
                value={skillText}
                onChange={(e) => setSkillEdits((prev) => ({ ...prev, [snap.id]: e.target.value }))}
                rows={3}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 13,
                  color: C.text,
                  background: '#eef0f1',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                  lineHeight: 1.55,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </UI.Card>
          );
        }}
      </GroupedList>
    );
  }

  function renderItems() {
    if (items === null) return <Loading />;
    if (items.length === 0) return <Empty hint="Alla inkommande mail har confidence ≥ 0,7 eller är redan beslutade." />;
    const groups = selected === ALL ? groupByClient(items) : [{ clientId: 'one', name: null, items }];
    return (
      <GroupedList groups={groups}>
        {(item) => {
          const Icon = TYPE_ICON[item.schema_type] || FileText;
          return (
            <UI.Card key={item.id} padding="18px 22px" style={{ opacity: busyId === item.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                  <IconBox><Icon size={16} /></IconBox>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.name || '(utan titel)'}</div>
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
                  <strong style={{ color: C.text }}>{item.subject || '(utan ämne)'}</strong>
                  {item.from_email && <span> · från {item.from_email}</span>}
                </div>
              )}
              {item.content && <div style={contentStyle}>{item.content}</div>}
            </UI.Card>
          );
        }}
      </GroupedList>
    );
  }

  function renderClaims() {
    if (claims === null) return <Loading />;
    if (claims.length === 0) return <Empty hint="Inga claims väntar på granskning — alla har confidence ≥ 0,7 eller är redan beslutade." />;
    const groups = selected === ALL ? groupByClient(claims) : [{ clientId: 'one', name: null, items: claims }];
    return (
      <GroupedList groups={groups}>
        {(claim) => {
          const sourceLabel = claim.source.map((s) => (s.kind === 'manual' ? s.label || 'manuell' : 'källa')).join(', ') || 'ingen källa';
          const text = edits[claim.id] ?? claim.statement ?? '';
          const isProperty = claim.claim_kind === 'property';
          const approvedAt = approved[claim.id];
          const validatedTs = claim.validated_at ?? approvedAt ?? null;
          const validatedBy = claim.validated_by ?? (approvedAt ? 'granskare (manuellt godkänd)' : null);
          return (
            <UI.Card key={claim.id} padding="18px 22px" style={{ opacity: busyId === claim.id ? 0.5 : 1 }}>
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
                    color: C.text,
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
            </UI.Card>
          );
        }}
      </GroupedList>
    );
  }
}

/* --- delade småkomponenter --- */

// Renderar poster grupperat per kund. I "Alla kunder"-läget får varje grupp en
// rubrik; för en enskild kund (name === null) blir det en rak lista som förut.
function GroupedList<T extends { id: string }>({
  groups,
  children,
}: {
  groups: Array<{ clientId: string; name: string | null; items: T[] }>;
  children: (item: T) => React.ReactNode;
}) {
  const grouped = groups.some((g) => g.name !== null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: grouped ? 22 : 12 }}>
      {groups.map((g) => (
        <div key={g.clientId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {g.name !== null && <ClientGroupHeader name={g.name} count={g.items.length} />}
          {g.items.map((item) => children(item))}
        </div>
      ))}
    </div>
  );
}

function ClientGroupHeader({ name, count }: { name: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 4px' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{name}</span>
      <UI.Pill style={{ minWidth: 0, fontSize: 11 }}>{count}</UI.Pill>
    </div>
  );
}

function Loading() {
  return (
    <UI.Card padding="48px 24px" style={{ textAlign: 'center', color: C.muted, fontSize: 13 }}>
      Laddar…
    </UI.Card>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <UI.Card padding="48px 24px">
      <UI.Empty icon={<Inbox size={32} color={C.dim} />} hint={hint} style={{ padding: 0 }}>
        Inget att granska
      </UI.Empty>
    </UI.Card>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(159,81,182,0.15)', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {children}
    </div>
  );
}

function Actions({ confidence, busy, onApprove, onReject }: { confidence: number | null; busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <UI.Badge tone="warn">conf {confidence != null ? confidence.toFixed(2) : '?'}</UI.Badge>
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
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
};

const contentStyle: React.CSSProperties = {
  fontSize: 12,
  color: C.text,
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
