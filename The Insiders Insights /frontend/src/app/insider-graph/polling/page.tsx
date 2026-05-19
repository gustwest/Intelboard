'use client';

import { Radar } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';

const CATEGORIES = [
  { name: 'Affär', desc: 'Var hittar man bra B2B-leverantörer inom X?' },
  { name: 'Finans', desc: 'Vilka bolag är ledande inom Y i Sverige?' },
  { name: 'Innovation', desc: 'Vilka är pionjärerna inom Z?' },
  { name: 'HR', desc: 'Vilka är attraktiva arbetsgivare inom W?' },
];

export default function GraphPollingPage() {
  return (
    <GraphPageShell
      title="AI-synlighet"
      icon={<Radar size={22} />}
      subtitle="Veckovis mätning av hur kunden framträder i OpenAI och Gemini. Bevisar effekten av GEO-arbetet."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <MetricCard label="Share of Voice" value="—" sub="Andel frågor med omnämnande" />
        <MetricCard label="Sentiment" value="—" sub="Tonalitet (-1 → 1)" />
        <MetricCard label="Parity Index" value="—" sub="Köns- och rollbalans" />
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>
          Kategorier som mäts
        </h2>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px' }}>
          Fyra ämnesområden, tre frågor per område, två modeller (GPT-4o + Gemini 1.5 Pro). 24 svar per
          mätrunda och kund.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {CATEGORIES.map((c) => (
            <div
              key={c.name}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
                {c.desc}
              </div>
            </div>
          ))}
        </div>
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
        <Radar size={32} color={C.dim} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>Ingen mätning gjord ännu</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          Polling-jobbet körs varje tisdag morgon. När första nollmätningen är klar (innan JSON-LD går
          live) visas baseline här, och därefter veckokurvor.
        </div>
      </div>
    </GraphPageShell>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '18px 20px',
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', marginTop: 8, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
