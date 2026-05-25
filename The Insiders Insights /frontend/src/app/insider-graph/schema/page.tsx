'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileJson, Copy, Check, Rocket } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type Client = {
  client_id: string;
  company_name: string | null;
  cdn_url: string | null;
};

// Speglar den faktiska claims-baserade outputen: Organization-rot med
// källförsedda egenskaper, källnoder och Claim-noder med isBasedOn → källa.
const B = 'https://profiles.geogiraph.com/exempel-ab';
const SAMPLE = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${B}#org`,
      name: 'Exempel AB',
      foundingDate: '2014',
      address: 'Göteborg',
      knowsAbout: ['Inbyggda system', 'Fordonsindustri'],
      identifier: '5566778899',
      description: 'Hjälper fordonstillverkare med inbyggda system.',
      sameAs: ['https://exempel.se', 'https://www.linkedin.com/company/exempel-ab'],
      subjectOf: [{ '@id': `${B}#src-bv1` }],
    },
    {
      '@type': 'Person',
      '@id': `${B}#person-anna`,
      name: 'Anna Andersson',
      jobTitle: 'VD',
      worksFor: { '@id': `${B}#org` },
    },
    {
      '@type': 'WebPage',
      '@id': `${B}#src-bv1`,
      url: 'https://www.allabolag.se/5566778899',
      datePublished: '2024-03-01',
      name: 'Exempel AB',
    },
    {
      '@type': 'Claim',
      '@id': `${B}#claim-0`,
      text: 'Grundat 2014',
      about: { '@id': `${B}#org` },
      isBasedOn: { '@id': `${B}#src-bv1` },
    },
    {
      '@type': 'Claim',
      '@id': `${B}#claim-1`,
      text: 'Hjälper fordonstillverkare med inbyggda system',
      about: { '@id': `${B}#org` },
      isBasedOn: { '@id': `${B}#src-bv1` },
    },
  ],
};

export default function GraphSchemaPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'cdn' | null>(null);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients[0]) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const c = clients.find((x) => x.client_id === selected);
    if (!c?.cdn_url) {
      setJson(null);
      return;
    }
    fetch(c.cdn_url)
      .then((r) => (r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`)))
      .then((txt) => {
        try {
          setJson(JSON.stringify(JSON.parse(txt), null, 2));
        } catch {
          setJson(txt);
        }
      })
      .catch((e) => setError(String(e)));
  }, [selected, clients]);

  const selectedClient = clients.find((c) => c.client_id === selected) || null;
  const cdnUrl = selectedClient?.cdn_url || `https://storage.googleapis.com/insider-graph-cdn-<project>/clients/<client_id>/schema.json`;

  function copy(text: string, key: 'cdn') {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <GraphPageShell
      title="JSON-LD-output"
      icon={<FileJson size={22} />}
      subtitle="Schema.org-grafen som genereras per kund och distribueras via CDN. För installation hos kund, se Leverans."
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
              {c.company_name || c.client_id} {!c.cdn_url && '(ej kompilerad)'}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '18px 22px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56' }}>CDN-URL</div>
          <code
            style={{
              fontSize: 12,
              color: C.accent,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              marginTop: 4,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cdnUrl}
          </code>
        </div>
        <button
          onClick={() => copy(cdnUrl, 'cdn')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'transparent',
            color: copied === 'cdn' ? '#86efac' : '#3a4b56',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {copied === 'cdn' ? <Check size={14} /> : <Copy size={14} />}
          {copied === 'cdn' ? 'Kopierad' : 'Kopiera URL'}
        </button>
      </div>

      <Link
        href="/insider-graph/leverans"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(159,81,182,0.08)',
          border: `1px solid rgba(159,81,182,0.25)`,
          borderRadius: 12,
          padding: '14px 20px',
          marginBottom: 16,
          textDecoration: 'none',
          color: '#3a4b56',
        }}
      >
        <Rocket size={18} color="#9f51b6" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Installera hos kund → Leverans</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Datan levereras inte via JS-injektion (många AI-crawlers kör inte JS). Profilsida, statisk identitets-snutt och badge finns under Leverans.
          </div>
        </div>
      </Link>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: '0 0 12px' }}>
          {json ? `Aktuell JSON-LD för ${selectedClient?.company_name || selected}` : 'Exempel-output'}
        </h2>
        <pre
          style={{
            background: '#eef0f1',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '14px 18px',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            lineHeight: 1.65,
            color: '#3a4b56',
            overflowX: 'auto',
            maxHeight: 480,
            margin: 0,
          }}
        >
{json || JSON.stringify(SAMPLE, null, 2)}
        </pre>
      </div>

      {error && (
        <div
          style={{
            marginTop: 16,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#fca5a5',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </GraphPageShell>
  );
}
