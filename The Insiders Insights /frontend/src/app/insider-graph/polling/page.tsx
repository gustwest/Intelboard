'use client';

import { useEffect, useState } from 'react';
import { Radar, RefreshCw } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type CategoryResult = {
  share_of_voice: number;
  sentiment_score: number;
  answer_count: number;
  mention_count: number;
};

type Week = {
  week_id: string;
  share_of_voice: number | null;
  sentiment_score: number | null;
  parity_index: number | null;
  category_results: Record<string, CategoryResult> | null;
  total_answers: number | null;
  answers_with_mention: number | null;
  models_used: string[] | null;
};

type Client = {
  client_id: string;
  company_name: string | null;
};

const CATEGORIES = [
  { name: 'Affär', desc: 'Var hittar man bra B2B-leverantörer inom X?' },
  { name: 'Finans', desc: 'Vilka bolag är ledande inom Y i Sverige?' },
  { name: 'Innovation', desc: 'Vilka är pionjärerna inom Z?' },
  { name: 'HR', desc: 'Vilka är attraktiva arbetsgivare inom W?' },
];

export default function GraphPollingPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<Week[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    graphFetch<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients.length && !selected) setSelected(d.clients[0].client_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setWeeks(null);
    graphFetch<{ weeks: Week[] }>(`/api/polling/${selected}`)
      .then((d) => setWeeks(d.weeks))
      .catch((e) => {
        setError(e.message);
        setWeeks([]);
      });
  }, [selected]);

  const latest = weeks?.[0] || null;

  return (
    <GraphPageShell
      title="AI-synlighet"
      icon={<Radar size={22} />}
      subtitle="Veckovis mätning av hur kunden framträder i OpenAI och Gemini. Bevisar effekten av GEO-arbetet."
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
          {clients.length === 0 && <option value="">Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>
        <button
          onClick={() => selected && graphFetch<{ weeks: Week[] }>(`/api/polling/${selected}`).then((d) => setWeeks(d.weeks))}
          title="Uppdatera"
          style={{
            padding: '8px 10px',
            background: 'transparent',
            color: C.muted,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricCard
          label="Share of Voice"
          value={latest?.share_of_voice != null ? `${Math.round(latest.share_of_voice * 100)}%` : '—'}
          sub={latest ? `${latest.answers_with_mention}/${latest.total_answers} svar` : 'Andel frågor med omnämnande'}
        />
        <MetricCard
          label="Sentiment"
          value={latest?.sentiment_score != null ? latest.sentiment_score.toFixed(2) : '—'}
          sub="Tonalitet (-1 → 1)"
        />
        <MetricCard
          label="Parity Index"
          value={latest?.parity_index != null ? `${Math.round(latest.parity_index * 100)}%` : '—'}
          sub="Andel kvinnliga personer"
        />
      </div>

      {error && (
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
          {error}
        </div>
      )}

      {latest?.category_results ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: '0 0 12px' }}>Per kategori — vecka {latest.week_id}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {Object.entries(latest.category_results).map(([cat, res]) => (
              <div
                key={cat}
                style={{
                  background: 'rgba(0,0,0,0.02)',
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#3a4b56', textTransform: 'capitalize' }}>{cat}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  SoV: <span style={{ color: '#3a4b56' }}>{Math.round(res.share_of_voice * 100)}%</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  Sentiment: <span style={{ color: '#3a4b56' }}>{res.sentiment_score.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                  {res.mention_count}/{res.answer_count} omnämnanden
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: '0 0 6px' }}>
            Kategorier som mäts (när polling körs)
          </h2>
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px' }}>
            Fyra ämnesområden, tre frågor per område, två modeller (GPT-4o + Gemini 1.5 Pro). 24 svar per mätrunda.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {CATEGORIES.map((c) => (
              <div
                key={c.name}
                style={{
                  background: 'rgba(0,0,0,0.02)',
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {weeks && weeks.length > 1 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: '0 0 12px' }}>Historik</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr',
              gap: 12,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: C.muted,
              fontWeight: 600,
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 8,
              marginBottom: 8,
            }}
          >
            <span>Vecka</span>
            <span>SoV</span>
            <span>Sentiment</span>
            <span>Parity</span>
            <span>Modeller</span>
          </div>
          {weeks.map((w) => (
            <div
              key={w.week_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr',
                gap: 12,
                padding: '10px 0',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 13,
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#3a4b56', fontFamily: 'ui-monospace, monospace' }}>{w.week_id}</span>
              <span style={{ color: '#3a4b56' }}>{w.share_of_voice != null ? `${Math.round(w.share_of_voice * 100)}%` : '—'}</span>
              <span style={{ color: '#3a4b56' }}>{w.sentiment_score != null ? w.sentiment_score.toFixed(2) : '—'}</span>
              <span style={{ color: '#3a4b56' }}>{w.parity_index != null ? `${Math.round(w.parity_index * 100)}%` : '—'}</span>
              <span style={{ color: C.muted, fontSize: 11 }}>{w.models_used?.join(', ') || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {weeks?.length === 0 && (
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
          <div style={{ fontSize: 14, color: '#3a4b56', fontWeight: 600 }}>Ingen mätning gjord ännu</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Polling-jobbet körs varje tisdag morgon. När OpenAI/Gemini-nycklar är satta körs första mätningen automatiskt.
          </div>
        </div>
      )}
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
      <div style={{ fontSize: 28, fontWeight: 600, color: '#3a4b56', marginTop: 8, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
