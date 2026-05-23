'use client';

import { useEffect, useState } from 'react';
import { Users, Upload, X, AlertCircle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { GRAPH_API, graphFetch } from '../_lib/api';

type ParsedEmployee = {
  name: string;
  linkedin_url: string;
  title: string | null;
  node_type: string;
  gender: string | null;
};

type Client = {
  client_id: string;
  company_name: string | null;
  company_linkedin_url: string | null;
  employee_count: number;
  node_types: { aktiv: number; episodisk: number; passiv: number };
  cdn_url: string | null;
  last_compiled: string | null;
  active_connectors: string[];
};

const SAMPLE_CSV = `name,linkedin_url,title,node_type,gender
Anna Andersson,https://www.linkedin.com/in/anna-andersson,VD,aktiv,kvinna
Erik Eriksson,https://www.linkedin.com/in/erik-eriksson,CMO,aktiv,man
Linda Lindberg,https://www.linkedin.com/in/linda-lindberg,Senior Advisor,episodisk,kvinna`;

export default function GraphKunderPage() {
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadClients() {
    setLoadError(null);
    try {
      const data = await graphFetch<{ clients: Client[] }>('/api/clients');
      setClients(data.clients);
    } catch (e: any) {
      setLoadError(e.message);
      setClients([]);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  return (
    <GraphPageShell
      title="Kunder"
      icon={<Users size={22} />}
      subtitle="geogiraph-kunder är samma bolag som i The Insiders. Här onboardas medarbetare och datakällor."
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
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Onboarda ny kund</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Ladda upp CSV med namn + LinkedIn-URL. Discovery-agenten skapar kund + medarbetare i Firestore.
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
              background: 'rgba(124,109,250,0.18)',
              color: '#7c6dfa',
              border: '1px solid rgba(124,109,250,0.3)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Upload size={14} /> Importera CSV
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
          <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>Inga Graph-kunder ännu</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
            Klicka på <strong>Importera CSV</strong> för att onboarda din första kund.
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
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '18px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{client.company_name || client.client_id}</div>
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
            style={{ color: '#7c6dfa', textDecoration: 'none', display: 'flex' }}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
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
      <span style={{ color: '#fff' }}>{value}</span>
    </div>
  );
}

function OnboardModal({ onClose }: { onClose: () => void }) {
  const [clientId, setClientId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyLinkedinUrl, setCompanyLinkedinUrl] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState<ParsedEmployee[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handlePreview() {
    setPreviewError(null);
    setPreview(null);
    try {
      const data = await graphFetch<{ employees: ParsedEmployee[] }>('/api/onboard/preview-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, company_name: companyName, csv }),
      });
      setPreview(data.employees);
    } catch (e: any) {
      setPreviewError(e.message || 'Kunde inte förhandsvisa');
    }
  }

  async function handleSubmit() {
    setResult(null);
    if (!clientId || !companyName) {
      setResult({ ok: false, message: 'client_id och company_name krävs' });
      return;
    }
    setSubmitting(true);
    try {
      const data = await graphFetch<{ client_id: string; employees_created: number }>('/api/onboard/from-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          company_name: companyName,
          company_linkedin_url: companyLinkedinUrl || null,
          org_number: orgNumber || null,
          csv,
        }),
      });
      setResult({ ok: true, message: `Skapade kund ${data.client_id} med ${data.employees_created} medarbetare.` });
    } catch (e: any) {
      setResult({ ok: false, message: e.message || 'Onboarding misslyckades' });
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
          background: 'var(--brand-panel)',
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          width: '100%',
          maxWidth: 760,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>Onboarda ny Graph-kund</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="client_id (slug)" value={clientId} onChange={setClientId} placeholder="exempel-ab" />
          <Field label="Företagsnamn" value={companyName} onChange={setCompanyName} placeholder="Exempel AB" />
          <Field
            label="Företagets LinkedIn-URL"
            value={companyLinkedinUrl}
            onChange={setCompanyLinkedinUrl}
            placeholder="https://www.linkedin.com/company/exempel-ab"
          />
          <Field label="Organisationsnummer" value={orgNumber} onChange={setOrgNumber} placeholder="556677-8899" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            CSV — kolumner: name, linkedin_url, title, node_type, gender
          </label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            style={{
              width: '100%',
              marginTop: 6,
              padding: '12px 14px',
              background: '#0a0a0f',
              color: '#d4d4ec',
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            onClick={handlePreview}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: '#fff',
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Förhandsvisa
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '8px 14px',
              background: 'rgba(124,109,250,0.25)',
              color: '#7c6dfa',
              border: '1px solid rgba(124,109,250,0.5)',
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

        {previewError && <Banner tone="error">{previewError}</Banner>}

        {preview && (
          <div style={{ background: '#0a0a0f', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{preview.length} medarbetare hittade</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {preview.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#fff', fontWeight: 500 }}>
                    {e.name} <span style={{ color: C.muted, fontWeight: 400 }}>· {e.title || '—'}</span>
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(124,109,250,0.15)', color: '#7c6dfa', fontWeight: 600, textTransform: 'uppercase' }}>
                    {e.node_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && <Banner tone={result.ok ? 'success' : 'error'}>{result.message}</Banner>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
          background: '#0a0a0f',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          fontSize: 13,
          outline: 'none',
        }}
      />
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
