'use client';

import { useEffect, useState } from 'react';
import { FileJson, Copy, Check } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type Client = {
  client_id: string;
  company_name: string | null;
  cdn_url: string | null;
};

const SAMPLE = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://insidergraph.io/clients/exempel-ab#org',
      name: 'Exempel AB',
      description: 'Konsultbolag inom GEO och AI-synlighet.',
      knowsAbout: ['GEO', 'AI-synlighet', 'Schema.org'],
      employee: [
        {
          '@type': 'Person',
          name: 'Anna Andersson',
          jobTitle: 'VD',
        },
      ],
    },
  ],
};

export default function GraphSchemaPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'snippet' | 'cdn' | null>(null);

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
  const gtmSnippet = makeGtmSnippet(cdnUrl);

  function copy(text: string, key: 'snippet' | 'cdn') {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <GraphPageShell
      title="JSON-LD-output"
      icon={<FileJson size={22} />}
      subtitle="Schema.org-grafen som distribueras via CDN och injiceras på kundens sajt via GTM."
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

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: 0 }}>GTM-snippet (engångsinstallation hos kund-IT)</h2>
          <button
            onClick={() => copy(gtmSnippet, 'snippet')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: copied === 'snippet' ? 'rgba(34,197,94,0.15)' : 'rgba(159,81,182,0.18)',
              color: copied === 'snippet' ? '#86efac' : '#9f51b6',
              border: `1px solid ${copied === 'snippet' ? 'rgba(34,197,94,0.3)' : 'rgba(159,81,182,0.3)'}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied === 'snippet' ? <Check size={12} /> : <Copy size={12} />}
            {copied === 'snippet' ? 'Kopierad' : 'Kopiera snippet'}
          </button>
        </div>
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
            margin: 0,
          }}
        >
{gtmSnippet}
        </pre>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.55 }}>
          Custom HTML Tag i GTM, trigger: <code>All Pages</code>, prioritet 1. Fetchen körs asynkront — noll påverkan på Core Web Vitals.
        </div>
      </div>

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

function makeGtmSnippet(cdnUrl: string): string {
  return `<script>
(function() {
  var CDN_URL = '${cdnUrl}';
  fetch(CDN_URL, { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.text = JSON.stringify(data);
      document.head.appendChild(s);
    })
    .catch(function() { /* tyst fail */ });
})();
</script>`;
}
