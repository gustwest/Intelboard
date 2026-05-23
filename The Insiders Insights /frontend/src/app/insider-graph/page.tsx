'use client';

import { LayoutDashboard, TrendingUp, Globe2, Activity, Clock } from 'lucide-react';
import GraphPageShell, { graphColors as C } from './_components/GraphPageShell';

const stats = [
  { label: 'Aktiva kunder', value: '0', sub: 'Inga kunder onboardade ännu' },
  { label: 'Datakällor anslutna', value: '0 / 19', sub: 'Connectors konfigurerade' },
  { label: 'JSON-LD-noder', value: '—', sub: 'Senast kompilerad: ej körd' },
  { label: 'AI-synlighet (SoV)', value: '—', sub: 'Mätning startar v.2 efter onboarding' },
];

const pipeline = [
  { key: 'Insamling', state: 'Inte konfigurerad', tone: 'idle' },
  { key: 'Lagring (Firestore)', state: 'Klar', tone: 'ok' },
  { key: 'Schema-kompilator', state: 'Klar (stub)', tone: 'ok' },
  { key: 'CDN-deploy', state: 'Saknar bucket-env', tone: 'warn' },
  { key: 'GTM-brygga', state: 'Inte distribuerad', tone: 'idle' },
  { key: 'Polling (AI-synlighet)', state: 'Inte aktiverad', tone: 'idle' },
];

const toneColor: Record<string, string> = {
  ok: '#22c55e',
  warn: '#f59e0b',
  idle: 'rgba(255,255,255,0.4)',
};

export default function InsiderGraphHomePage() {
  return (
    <GraphPageShell
      title="geogiraph — översikt"
      icon={<LayoutDashboard size={22} />}
      subtitle="GEO-motor som gör kundens organisation maskinläsbar för AI-sökmotorer."
      badge="MVP"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '18px 20px',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', marginTop: 8, letterSpacing: '-0.02em' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Activity size={16} color={C.accent} />
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#fff' }}>Pipeline-status</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pipeline.map((p) => (
              <div
                key={p.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: toneColor[p.tone],
                      boxShadow: p.tone === 'ok' ? '0 0 8px rgba(34,197,94,0.5)' : undefined,
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{p.key}</span>
                </div>
                <span style={{ fontSize: 12, color: C.muted }}>{p.state}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Globe2 size={16} color={C.accent} />
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#fff' }}>Så här fungerar geogiraph</h2>
          </div>
          <ol style={{ paddingLeft: 18, margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.75 }}>
            <li>Kund onboardas med CSV (medarbetare + LinkedIn-URL).</li>
            <li>Connectors hämtar profiler, inlägg, jobb, events.</li>
            <li>Schema-motorn kompilerar JSON-LD per kund.</li>
            <li>Filen serveras via Cloud CDN och injiceras via GTM-snippet.</li>
            <li>Polling-jobb mäter AI-synlighet veckovis.</li>
          </ol>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(124,109,250,0.06)',
              border: '1px solid rgba(124,109,250,0.2)',
              borderRadius: 8,
              fontSize: 12,
              color: C.muted,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <Clock size={14} color={C.accent} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              MVP-läget kör en isolerad pipeline mot Firestore. Inga skarpa kunder är aktiverade än —
              vyerna nedan visar strukturen du kommer att administrera.
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '20px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TrendingUp size={16} color={C.accent} />
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#fff' }}>Mätningsdimensioner</h2>
        </div>
        <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 12px' }}>
          Hur geogiraph bevisar effekt — alla mätvärden räknas internt och rapporteras till kund.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {[
            { name: 'Share of Voice', desc: 'Andel AI-frågor där kunden nämns' },
            { name: 'Sentiment', desc: 'Tonalitet i AI-svar (-1 till 1)' },
            { name: 'Parity Index', desc: 'Köns- och rollbalans i rekommendationer' },
            { name: 'Baseline-delta', desc: 'Tillväxt oberoende av följarmängd' },
          ].map((m) => (
            <div
              key={m.name}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{m.name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </GraphPageShell>
  );
}
