'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Plus, X, AlertCircle, CheckCircle2, ExternalLink, RefreshCw, Search } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type ConnectorField = {
  name: string;
  label: string;
  type: 'text' | 'url' | 'bool' | 'feed_list';
  required: boolean;
  placeholder: string;
  help: string;
};

type ConnectorMeta = {
  id: string;
  fetch_method: string;
  output_types: string[];
  frequency: string;
  tier: string;
  input_fields: ConnectorField[];
};

type EmployeeRow = {
  name: string;
  linkedin_url: string;
  title: string;
  node_type: string;
  gender: string;
};

type RssFeedRow = { url: string; schema_type: string; label: string };

type Client = {
  client_id: string;
  company_name: string | null;
  company_linkedin_url: string | null;
  employee_count: number;
  node_types: { aktiv: number; episodisk: number; passiv: number };
  cdn_url: string | null;
  last_compiled: string | null;
  active_connectors: string[];
  tier?: string;
};

const NODE_TYPES = ['aktiv', 'episodisk', 'passiv'];

function emptyEmployee(): EmployeeRow {
  return { name: '', linkedin_url: '', title: '', node_type: 'aktiv', gender: '' };
}

export default function GraphKunderPage() {
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadClients = useCallback(() => {
    return graphFetch<{ clients: Client[] }>('/api/clients')
      .then((data) => {
        setClients(data.clients);
        setLoadError(null);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : String(e));
        setClients([]);
      });
  }, []);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((data) => {
        setClients(data.clients);
        setLoadError(null);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : String(e));
        setClients([]);
      });
  }, []);

  return (
    <GraphPageShell
      title="Kunder"
      icon={<Users size={22} />}
      subtitle="geograph-kunder är samma bolag som i The Insiders. Här onboardas medarbetare och datakällor."
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56' }}>Onboarda ny kund</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Fyll i företagsuppgifter, välj connectors och lägg till medarbetare manuellt.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={loadClients}
            title="Uppdatera lista"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              background: 'transparent',
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'rgba(159,81,182,0.18)',
              color: '#9f51b6',
              border: '1px solid rgba(159,81,182,0.3)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Ny kund
          </button>
        </div>
      </div>

      {loadError && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#fca5a5',
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          Kunde inte hämta kunder: {loadError}
        </div>
      )}

      {clients === null ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Laddar…
        </div>
      ) : clients.length === 0 ? (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Users size={32} color={C.dim} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: '#3a4b56', fontWeight: 600 }}>Inga Graph-kunder ännu</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
            Klicka på <strong>Ny kund</strong> för att onboarda din första kund.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {clients.map((c) => (
            <ClientCard key={c.client_id} client={c} />
          ))}
        </div>
      )}

      {showModal && (
        <OnboardModal
          onClose={() => {
            setShowModal(false);
            loadClients();
          }}
        />
      )}
    </GraphPageShell>
  );
}

function ClientCard({ client }: { client: Client }) {
  return (
    <Link
      href={`/insider-graph/kunder/${client.client_id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56' }}>{client.company_name || client.client_id}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
              {client.client_id}
            </div>
          </div>
          {client.cdn_url && (
            <a
              href={client.cdn_url}
              target="_blank"
              rel="noreferrer"
              title="Öppna JSON-LD i ny flik"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#9f51b6', textDecoration: 'none', display: 'flex' }}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {client.tier === 'premium' && <Badge color="#9f51b6" label="premium" />}
          <Badge color="#22c55e" label={`${client.node_types.aktiv} aktiv`} />
          <Badge color="#f59e0b" label={`${client.node_types.episodisk} episodisk`} />
          <Badge color={C.muted} label={`${client.node_types.passiv} passiv`} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, fontSize: 11, color: C.muted }}>
          <Row label="Medarbetare" value={`${client.employee_count} st`} />
          <Row label="Connectors" value={client.active_connectors.join(', ') || '—'} />
          <Row
            label="Senast kompilerad"
            value={client.last_compiled ? new Date(client.last_compiled).toLocaleString('sv-SE') : 'Inte ännu'}
          />
        </div>
      </div>
    </Link>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 4,
        background: `${color}22`,
        color,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: '#3a4b56' }}>{value}</span>
    </div>
  );
}

function OnboardModal({ onClose }: { onClose: () => void }) {
  const [clientId, setClientId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tier, setTier] = useState<'default' | 'premium'>('default');
  const [profileBaseUrl, setProfileBaseUrl] = useState('');

  const [available, setAvailable] = useState<ConnectorMeta[]>([]);
  const [active, setActive] = useState<Set<string>>(new Set(['linkedin']));
  // Skalära connector-fältvärden, keyade på fältets `name` (matchar OnboardRequest).
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [rssFeeds, setRssFeeds] = useState<RssFeedRow[]>([{ url: '', schema_type: 'NewsArticle', label: '' }]);

  const [employees, setEmployees] = useState<EmployeeRow[]>([emptyEmployee()]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    graphFetch<{ connectors: ConnectorMeta[] }>('/api/connectors')
      .then((d) => setAvailable(d.connectors))
      .catch(() => setAvailable([]));
  }, []);

  function toggleConnector(id: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setField(name: string, value: string | boolean) {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  }

  function setEmployee(i: number, patch: Partial<EmployeeRow>) {
    setEmployees((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  function validate(): string | null {
    if (!clientId.trim()) return 'client_id (slug) krävs.';
    if (!companyName.trim()) return 'Företagsnamn krävs.';
    for (const conn of available) {
      if (!active.has(conn.id)) continue;
      for (const f of conn.input_fields) {
        if (!f.required) continue;
        if (f.type === 'feed_list') {
          if (!rssFeeds.some((r) => r.url.trim())) return `${conn.id}: minst en feed-URL krävs.`;
        } else {
          const v = fieldValues[f.name];
          if (typeof v !== 'string' || !v.trim()) return `${conn.id}: "${f.label}" krävs.`;
        }
      }
    }
    const valid = employees.filter((e) => e.name.trim() && e.linkedin_url.trim());
    if (valid.length === 0) return 'Lägg till minst en medarbetare med namn + LinkedIn-URL.';
    return null;
  }

  async function handleSubmit() {
    setResult(null);
    const err = validate();
    if (err) {
      setResult({ ok: false, message: err });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        client_id: clientId.trim(),
        company_name: companyName.trim(),
        active_connectors: [...active],
        company_linkedin_url: active.has('linkedin') ? (fieldValues['company_linkedin_url'] as string) || null : null,
        lei: active.has('gleif') ? (fieldValues['lei'] as string) || null : null,
        website_start_url: active.has('website') ? (fieldValues['website_start_url'] as string) || null : null,
        scrape_employee_profiles: active.has('linkedin') ? !!fieldValues['scrape_employee_profiles'] : false,
        rss_feeds: active.has('rss')
          ? rssFeeds.filter((r) => r.url.trim()).map((r) => ({ url: r.url.trim(), schema_type: r.schema_type, label: r.label.trim() || null }))
          : [],
        employees: employees
          .filter((e) => e.name.trim() && e.linkedin_url.trim())
          .map((e) => ({
            name: e.name.trim(),
            linkedin_url: e.linkedin_url.trim(),
            title: e.title.trim() || null,
            node_type: e.node_type,
            gender: e.gender.trim() || null,
          })),
        tier,
        profile_base_url: tier === 'premium' ? profileBaseUrl.trim() || null : null,
      };
      const data = await graphFetch<{ client_id: string; employees_created: number }>('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setResult({ ok: true, message: `Skapade kund ${data.client_id} med ${data.employees_created} medarbetare.` });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Onboarding misslyckades' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          width: '100%',
          maxWidth: 820,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#3a4b56', margin: 0 }}>Onboarda ny Graph-kund</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Företag */}
        <SectionLabel>Företag</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="client_id (slug)" value={clientId} onChange={setClientId} placeholder="exempel-ab" />
          <Field label="Företagsnamn" value={companyName} onChange={setCompanyName} placeholder="Exempel AB" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, color: '#6a7e8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Hosting-tier
          </label>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginTop: 6, marginLeft: 12, verticalAlign: 'middle' }}>
            {([['default', 'Default (geogiraph)'], ['premium', 'Premium (egen domän)']] as ['default' | 'premium', string][]).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTier(v)}
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: tier === v ? 'rgba(159,81,182,0.18)' : '#eef0f1',
                  color: tier === v ? '#9f51b6' : '#3a4b56',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tier === 'premium' && (
            <div style={{ marginTop: 12 }}>
              <Field
                label="Profilsidans bas-URL (kundens domän)"
                value={profileBaseUrl}
                onChange={setProfileBaseUrl}
                placeholder="https://profil.kund.se"
              />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Sätter @id-basen för JSON-LD. Kräver CNAME → vår tjänst (se Leverans).
              </div>
            </div>
          )}
        </div>

        {/* Connectors */}
        <SectionLabel>Connectors — slå på de källor kunden ska hämta data från</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {available.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted }}>Inga connectors tillgängliga.</div>
          )}
          {available.map((conn) => (
            <ConnectorCard
              key={conn.id}
              conn={conn}
              active={active.has(conn.id)}
              onToggle={() => toggleConnector(conn.id)}
              fieldValues={fieldValues}
              setField={setField}
              rssFeeds={rssFeeds}
              setRssFeeds={setRssFeeds}
            />
          ))}
        </div>

        {/* Medarbetare */}
        <SectionLabel>Medarbetare</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.8fr 1.2fr 1fr 0.9fr 28px', gap: 8, fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 2px' }}>
            <span>Namn</span>
            <span>LinkedIn-URL</span>
            <span>Titel</span>
            <span>Nodtyp</span>
            <span>Kön</span>
            <span />
          </div>
          {employees.map((emp, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.8fr 1.2fr 1fr 0.9fr 28px', gap: 8, alignItems: 'center' }}>
              <RowInput value={emp.name} onChange={(v) => setEmployee(i, { name: v })} placeholder="Anna Andersson" />
              <RowInput value={emp.linkedin_url} onChange={(v) => setEmployee(i, { linkedin_url: v })} placeholder="https://linkedin.com/in/…" />
              <RowInput value={emp.title} onChange={(v) => setEmployee(i, { title: v })} placeholder="VD" />
              <select
                value={emp.node_type}
                onChange={(e) => setEmployee(i, { node_type: e.target.value })}
                style={selectStyle}
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <RowInput value={emp.gender} onChange={(v) => setEmployee(i, { gender: v })} placeholder="kvinna" />
              <button
                onClick={() => setEmployees((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))}
                title="Ta bort rad"
                style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setEmployees((prev) => [...prev, emptyEmployee()])}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'transparent',
            color: '#3a4b56',
            border: `1px dashed ${C.border}`,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 18,
          }}
        >
          <Plus size={13} /> Lägg till medarbetare
        </button>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '9px 16px',
              background: 'rgba(159,81,182,0.25)',
              color: '#9f51b6',
              border: '1px solid rgba(159,81,182,0.5)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Skapar…' : 'Skapa kund'}
          </button>
        </div>

        {result && <Banner tone={result.ok ? 'success' : 'error'}>{result.message}</Banner>}
      </div>
    </div>
  );
}

function ConnectorCard({
  conn,
  active,
  onToggle,
  fieldValues,
  setField,
  rssFeeds,
  setRssFeeds,
}: {
  conn: ConnectorMeta;
  active: boolean;
  onToggle: () => void;
  fieldValues: Record<string, string | boolean>;
  setField: (name: string, value: string | boolean) => void;
  rssFeeds: RssFeedRow[];
  setRssFeeds: (rows: RssFeedRow[]) => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${active ? 'rgba(159,81,182,0.4)' : C.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        background: active ? 'rgba(159,81,182,0.05)' : 'transparent',
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={active} onChange={onToggle} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56', textTransform: 'capitalize' }}>{conn.id}</span>
        <span style={{ fontSize: 10, color: C.muted }}>· {conn.fetch_method} · {conn.frequency}</span>
      </label>

      {active && conn.input_fields.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {conn.input_fields.map((f) => {
            if (conn.id === 'gleif' && f.name === 'lei') {
              return (
                <LeiSearchField
                  key={f.name}
                  label={`${f.label}${f.required ? ' *' : ''}`}
                  help={f.help}
                  placeholder={f.placeholder}
                  value={(fieldValues[f.name] as string) || ''}
                  onChange={(v) => setField(f.name, v)}
                />
              );
            }
            if (f.type === 'bool') {
              return (
                <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3a4b56', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!fieldValues[f.name]}
                    onChange={(e) => setField(f.name, e.target.checked)}
                  />
                  {f.label}
                  {f.help && <span style={{ color: C.muted, fontSize: 11 }}>— {f.help}</span>}
                </label>
              );
            }
            if (f.type === 'feed_list') {
              return <RssFeedEditor key={f.name} conn={conn} rows={rssFeeds} setRows={setRssFeeds} help={f.help} />;
            }
            return (
              <div key={f.name}>
                <Field
                  label={`${f.label}${f.required ? ' *' : ''}`}
                  value={(fieldValues[f.name] as string) || ''}
                  onChange={(v) => setField(f.name, v)}
                  placeholder={f.placeholder}
                />
                {f.help && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{f.help}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RssFeedEditor({
  conn,
  rows,
  setRows,
  help,
}: {
  conn: ConnectorMeta;
  rows: RssFeedRow[];
  setRows: (rows: RssFeedRow[]) => void;
  help: string;
}) {
  const types = conn.output_types.length ? conn.output_types : ['NewsArticle'];
  function update(i: number, patch: Partial<RssFeedRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  return (
    <div>
      <label style={{ fontSize: 11, color: '#6a7e8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        RSS-feeds *
      </label>
      {help && <div style={{ fontSize: 11, color: C.muted, margin: '3px 0 8px' }}>{help}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 28px', gap: 6, alignItems: 'center' }}>
            <RowInput value={r.url} onChange={(v) => update(i, { url: v })} placeholder="https://kund.se/feed" />
            <select value={r.schema_type} onChange={(e) => update(i, { schema_type: e.target.value })} style={selectStyle}>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <RowInput value={r.label} onChange={(v) => update(i, { label: v })} placeholder="Pressrum" />
            <button
              onClick={() => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)}
              title="Ta bort feed"
              style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setRows([...rows, { url: '', schema_type: types[0], label: '' }])}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          marginTop: 8,
          background: 'transparent',
          color: '#3a4b56',
          border: `1px dashed ${C.border}`,
          borderRadius: 7,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Plus size={12} /> Lägg till feed
      </button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 8px',
  background: '#eef0f1',
  color: '#3a4b56',
  border: '1px solid #dfe3e7',
  borderRadius: 6,
  fontSize: 12,
  outline: 'none',
};

function RowInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '8px 10px',
        background: '#eef0f1',
        color: '#3a4b56',
        border: '1px solid #dfe3e7',
        borderRadius: 6,
        fontSize: 12,
        outline: 'none',
      }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#6a7e8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: '#6a7e8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 4,
          padding: '8px 12px',
          background: '#eef0f1',
          color: '#3a4b56',
          border: '1px solid #dfe3e7',
          borderRadius: 6,
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  );
}

type LeiHit = { name: string | null; lei: string; address?: string | null };

function LeiSearchField({
  value,
  onChange,
  label,
  help,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  help: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LeiHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const d = await graphFetch<{ results: LeiHit[] }>(
        `/api/connectors/gleif/search?q=${encodeURIComponent(q)}`,
      );
      setHits(d.results || []);
      setSearched(true);
    } catch {
      setError('Sökningen mot GLEIF misslyckades. Försök igen.');
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  function pick(hit: LeiHit) {
    onChange(hit.lei);
    setHits([]);
    setSearched(false);
    setQuery(hit.name || hit.lei);
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 12px',
    background: '#eef0f1',
    color: '#3a4b56',
    border: '1px solid #dfe3e7',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
  };

  return (
    <div>
      <label style={{ fontSize: 11, color: '#6a7e8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      {help && <div style={{ fontSize: 11, color: C.muted, margin: '3px 0 6px' }}>{help}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            // Tillåt direkt inklistrad LEI (20 alfanumeriska tecken) utan sökning.
            if (/^[A-Za-z0-9]{20}$/.test(v.trim())) onChange(v.trim().toUpperCase());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          placeholder={placeholder || 'Sök företagsnamn eller klistra in LEI'}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={search}
          disabled={loading || !query.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 12px',
            background: 'transparent',
            color: '#3a4b56',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: loading || !query.trim() ? 'default' : 'pointer',
            opacity: loading || !query.trim() ? 0.5 : 1,
          }}
        >
          <Search size={13} /> {loading ? 'Söker…' : 'Sök'}
        </button>
      </div>

      {value && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: '#3a4b56' }}>
          <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
          <span>
            Vald LEI: <strong style={{ fontFamily: 'monospace' }}>{value}</strong>
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            title="Rensa"
            style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>{error}</div>}

      {hits.length > 0 && (
        <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {hits.map((h) => (
            <button
              key={h.lei}
              type="button"
              onClick={() => pick(h)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: value === h.lei ? 'rgba(159,81,182,0.08)' : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3a4b56' }}>{h.name || '(namnlöst)'}</div>
              <div style={{ fontSize: 11, color: C.muted }}>
                <span style={{ fontFamily: 'monospace' }}>{h.lei}</span>
                {h.address ? ` · ${h.address}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
      {searched && !loading && hits.length === 0 && !error && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          Inga träffar. Justera sökningen eller klistra in LEI-koden direkt.
        </div>
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const bg = tone === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
  const border = tone === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)';
  const color = tone === 'error' ? '#fca5a5' : '#86efac';
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 8, color, fontSize: 12, marginBottom: 12, lineHeight: 1.55 }}>
      <Icon size={14} style={{ marginTop: 2, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}
