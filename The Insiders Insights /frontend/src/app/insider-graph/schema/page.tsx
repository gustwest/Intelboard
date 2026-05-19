'use client';

import { FileJson, Copy } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';

const SAMPLE = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://insidergraph.io/clients/exempel-ab#org',
      name: 'Exempel AB',
      description:
        'Konsultbolag inom GEO och AI-synlighet. Hjälper svenska företag bli synliga i ChatGPT, Perplexity och Gemini.',
      foundingDate: '2024-01-01',
      knowsAbout: ['GEO', 'AI-synlighet', 'Schema.org', 'JSON-LD'],
      employee: [
        {
          '@type': 'Person',
          '@id': 'https://insidergraph.io/clients/exempel-ab#org/employees/anna',
          name: 'Anna Andersson',
          jobTitle: 'VD',
          worksFor: { '@id': 'https://insidergraph.io/clients/exempel-ab#org' },
          knowsAbout: ['AI-strategi', 'B2B-marknadsföring'],
        },
      ],
      subjectOf: [
        {
          '@type': 'SocialMediaPosting',
          author: { '@id': 'https://insidergraph.io/clients/exempel-ab#org/employees/anna' },
          datePublished: '2026-05-12',
          articleBody:
            'Vi presenterar idag vår nya GEO-rapport som visar hur svenska bolag positionerar sig i AI-sökmotorer.',
          url: 'https://www.linkedin.com/posts/example',
        },
      ],
    },
  ],
};

export default function GraphSchemaPage() {
  const json = JSON.stringify(SAMPLE, null, 2);

  return (
    <GraphPageShell
      title="JSON-LD-output"
      icon={<FileJson size={22} />}
      subtitle="Schema.org-grafen som distribueras via CDN och injiceras på kundens sajt via GTM."
      badge="Förhandsvisning"
    >
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
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>CDN-URL</div>
          <code
            style={{
              fontSize: 12,
              color: C.accent,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              marginTop: 4,
              display: 'inline-block',
            }}
          >
            https://cdn.insidergraph.io/clients/&lt;client_id&gt;/schema.json
          </code>
        </div>
        <button
          disabled
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'transparent',
            color: C.muted,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'not-allowed',
            opacity: 0.6,
          }}
        >
          <Copy size={14} /> Kopiera GTM-snippet
        </button>
      </div>

      <div
        style={{
          background: '#0a0a0f',
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '20px 24px',
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          lineHeight: 1.75,
          color: '#d4d4ec',
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {json}
      </div>

      <div
        style={{
          marginTop: 16,
          background: 'rgba(124,109,250,0.06)',
          border: '1px solid rgba(124,109,250,0.2)',
          borderLeft: '3px solid #7c6dfa',
          borderRadius: 8,
          padding: '14px 18px',
          fontSize: 12,
          color: '#d4d4ec',
          lineHeight: 1.65,
        }}
      >
        Visar exempel-output. När en kund är onboardad och Schema-agenten har körts visas den verkliga,
        kompilerade grafen här tillsammans med diff mot föregående version.
      </div>
    </GraphPageShell>
  );
}
