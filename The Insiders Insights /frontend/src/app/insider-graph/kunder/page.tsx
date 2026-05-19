'use client';

import { useState } from 'react';
import { Users, Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';

const GRAPH_API =
  process.env.NEXT_PUBLIC_GRAPH_API_URL || 'https://insider-graph-api-6fqkbpmhrq-lz.a.run.app';

type ParsedEmployee = {
  name: string;
  linkedin_url: string;
  title: string | null;
  node_type: string;
  gender: string | null;
};

const SAMPLE_CSV = `name,linkedin_url,title,node_type,gender
Anna Andersson,https://www.linkedin.com/in/anna-andersson,VD,aktiv,kvinna
Erik Eriksson,https://www.linkedin.com/in/erik-eriksson,CMO,aktiv,man
Linda Lindberg,https://www.linkedin.com/in/linda-lindberg,Senior Advisor,episodisk,kvinna`;

export default function GraphKunderPage() {
  const [showModal, setShowModal] = useState(false);

  return (
    <GraphPageShell
      title="Kunder"
      icon={<Users size={22} />}
      subtitle="Insider Graph-kunder är samma bolag som i The Insiders. Här onboardas medarbetare och datakällor."
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
            Välj en befintlig Insiders-kund och ladda upp CSV med namn + LinkedIn-URL. Discovery-agenten tar därefter över.
          </div>
        </div>
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
          Klicka på <strong>Importera CSV</strong> ovan för att onboarda din första kund. Discovery-agenten skapar kund + medarbetare i Firestore.
        </div>
      </div>

      {showModal && <OnboardModal onClose={() => setShowModal(false)} />}
    </GraphPageShell>
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

  const apiConfigured = Boolean(GRAPH_API);

  async function handlePreview() {
    setPreviewError(null);
    setPreview(null);
    if (!apiConfigured) {
      const local = parseLocalCsv(csv);
      setPreview(local);
      return;
    }
    try {
      const resp = await fetch(`${GRAPH_API}/api/onboard/preview-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, company_name: companyName, csv }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setPreview(data.employees);
    } catch (e: any) {
      setPreviewError(e.message || 'Kunde inte förhandsvisa');
    }
  }

  async function handleSubmit() {
    setResult(null);
    if (!apiConfigured) {
      setResult({ ok: false, message: 'Graph-API:t är inte konfigurerat (NEXT_PUBLIC_GRAPH_API_URL saknas). UI:n är klar att kopplas in.' });
      return;
    }
    if (!clientId || !companyName) {
      setResult({ ok: false, message: 'client_id och company_name krävs' });
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch(`${GRAPH_API}/api/onboard/from-csv`, {
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
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
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

        {!apiConfigured && (
          <Banner tone="warn">
            Graph-API:t är inte konfigurerat ännu. Du kan förhandsgranska CSV lokalt men inte skapa kunder förrän
            <code style={{ margin: '0 4px' }}>NEXT_PUBLIC_GRAPH_API_URL</code> är satt och tjänsten är deployad.
          </Banner>
        )}

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
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
              {preview.length} medarbetare hittade {!apiConfigured && '(lokal parsning)'}
            </div>
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

function Banner({ tone, children }: { tone: 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const bg = tone === 'error' ? 'rgba(239,68,68,0.1)' : tone === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)';
  const border = tone === 'error' ? 'rgba(239,68,68,0.3)' : tone === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)';
  const color = tone === 'error' ? '#fca5a5' : tone === 'success' ? '#86efac' : '#fcd34d';
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 8, color, fontSize: 12, marginBottom: 12, lineHeight: 1.55 }}>
      <Icon size={14} style={{ marginTop: 2, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}

function parseLocalCsv(text: string): ParsedEmployee[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows: ParsedEmployee[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = parts[idx] || ''));
    if (!row.name || !row.linkedin_url) continue;
    rows.push({
      name: row.name,
      linkedin_url: row.linkedin_url,
      title: row.title || null,
      node_type: ['aktiv', 'episodisk', 'passiv'].includes(row.node_type) ? row.node_type : 'aktiv',
      gender: row.gender || null,
    });
  }
  return rows;
}
