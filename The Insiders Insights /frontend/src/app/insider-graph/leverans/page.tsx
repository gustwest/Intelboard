'use client';

import { useCallback, useEffect, useState } from 'react';
import { Rocket, Copy, Check, ExternalLink, ChevronDown, ChevronRight, Play, Loader2, X, Clock } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';
import { useJobRuns, fmtRelative } from '../_lib/jobRuns';

type Client = {
  client_id: string;
  company_name: string | null;
  profile_url: string | null;
  cdn_url: string | null;
};

// Speglar den faktiska claims-baserade outputen: Organization-rot med
// källförsedda egenskaper, källnoder och Claim-noder med isBasedOn → källa.
const SAMPLE_BASE = 'https://profiles.geogiraph.com/exempel-ab';
const SAMPLE_JSON = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SAMPLE_BASE}#org`,
      name: 'Exempel AB',
      foundingDate: '2014',
      address: 'Göteborg',
      knowsAbout: ['Inbyggda system', 'Fordonsindustri'],
      identifier: '5566778899',
      description: 'Hjälper fordonstillverkare med inbyggda system.',
      sameAs: ['https://exempel.se', 'https://www.linkedin.com/company/exempel-ab'],
      subjectOf: [{ '@id': `${SAMPLE_BASE}#src-bv1` }],
    },
    {
      '@type': 'Person',
      '@id': `${SAMPLE_BASE}#person-anna`,
      name: 'Anna Andersson',
      jobTitle: 'VD',
      worksFor: { '@id': `${SAMPLE_BASE}#org` },
    },
    {
      '@type': 'WebPage',
      '@id': `${SAMPLE_BASE}#src-bv1`,
      url: 'https://www.allabolag.se/5566778899',
      datePublished: '2024-03-01',
      name: 'Exempel AB',
    },
    {
      '@type': 'Claim',
      '@id': `${SAMPLE_BASE}#claim-0`,
      text: 'Grundat 2014',
      about: { '@id': `${SAMPLE_BASE}#org` },
      isBasedOn: { '@id': `${SAMPLE_BASE}#src-bv1` },
    },
    {
      '@type': 'Claim',
      '@id': `${SAMPLE_BASE}#claim-1`,
      text: 'Hjälper fordonstillverkare med inbyggda system',
      about: { '@id': `${SAMPLE_BASE}#org` },
      isBasedOn: { '@id': `${SAMPLE_BASE}#src-bv1` },
    },
  ],
};

type Delivery = {
  profile_url: string;
  compiled_url: string | null;
  identity_snippet: string;
};

type Badge = { snippet: string; preview: string };

type Theme = 'light' | 'dark';
type Variant = 'footer' | 'pill';
type DeliveryMode = 'static' | 'js';

export default function LeveransPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [badge, setBadge] = useState<Badge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [attested, setAttested] = useState<{ key: string; label: string; included: number; staged: number }[] | null>(null);
  const { latest, active: jobActive, trigger: runJob } = useJobRuns(selected);

  // Badge-kontroller
  const [theme, setTheme] = useState<Theme>('light');
  const [variant, setVariant] = useState<Variant>('footer');
  const [mode, setMode] = useState<DeliveryMode>('static');
  const [useAccent, setUseAccent] = useState(false);
  const [accent, setAccent] = useState(C.accent);

  // Full kompilerad JSON-LD-graf (QA-vy, hopfällbar) — egen felhantering
  // så att en CDN-miss inte förorenar sidans huvud-fel-banner.
  const [showOutput, setShowOutput] = useState(false);
  const [output, setOutput] = useState<{ clientId: string; json: string } | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);

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
    graphFetch<Delivery>(`/api/delivery/${selected}`)
      .then(setDelivery)
      .catch((e) => setError(e.message));
  }, [selected, refreshTick]);

  // Officiell (attesterad) data — vad som ingår i leveransen.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    graphFetch<{ source_types: { key: string; label: string; included: number; staged: number }[] }>(`/api/attested/${selected}/status`)
      .then((d) => { if (!cancelled) setAttested(d.source_types); })
      .catch(() => { if (!cancelled) setAttested([]); });
    return () => { cancelled = true; };
  }, [selected, refreshTick]);

  useEffect(() => {
    if (!selected) return;
    const q = new URLSearchParams({ theme, variant, delivery: mode });
    if (useAccent) q.set('accent', accent);
    graphFetch<Badge>(`/api/badge/${selected}?${q.toString()}`)
      .then(setBadge)
      .catch((e) => setError(e.message));
  }, [selected, theme, variant, mode, useAccent, accent]);

  // Hämta den fulla kompilerade grafen från CDN när kund byts
  useEffect(() => {
    const c = clients.find((x) => x.client_id === selected);
    if (!c?.cdn_url) return;
    let cancelled = false;
    fetch(c.cdn_url)
      .then((r) => (r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`)))
      .then((txt) => {
        if (cancelled) return;
        let json = txt;
        try {
          json = JSON.stringify(JSON.parse(txt), null, 2);
        } catch {
          /* lämna rå text om parsning misslyckas */
        }
        setOutput({ clientId: c.client_id, json });
        setOutputError(null);
      })
      .catch((e) => !cancelled && setOutputError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [selected, clients, refreshTick]);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const profileUrl = delivery?.compiled_url || delivery?.profile_url || null;
  const isCompiled = Boolean(delivery?.compiled_url);

  const selectedClient = clients.find((c) => c.client_id === selected) || null;
  const cdnUrl =
    selectedClient?.cdn_url ||
    'https://storage.googleapis.com/insider-graph-cdn-<project>/clients/<client_id>/schema.json';
  const fullJson = output?.clientId === selected ? output.json : null;

  return (
    <GraphPageShell
      title="Leverans"
      icon={<Rocket size={22} />}
      subtitle="Det kunden installerar: profilsidan, den stabila JSON-LD-snutten och verifierings-badgen."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Kund:</label>
        <select
          value={selected || ''}
          onChange={(e) => setSelected(e.target.value)}
          style={selectStyle}
        >
          {clients.length === 0 && <option>Inga kunder</option>}
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.company_name || c.client_id}
            </option>
          ))}
        </select>
      </div>

      {/* Leveransstatus */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 22px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.muted }}>
            <Clock size={13} color={C.dim} />
            <strong style={{ color: C.text, fontWeight: 600 }}>Kompilerad:</strong>
            {(() => {
              const r = latest('compile_schema');
              if (!r) return <span style={{ color: C.dim }}>aldrig</span>;
              return (
                <>
                  <span>{fmtRelative(r.started_at)}</span>
                  {r.status === 'success' && <Check size={12} color="#16a34a" />}
                  {r.status === 'failed' && <X size={12} color="#dc2626" />}
                </>
              );
            })()}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.muted }}>
            <strong style={{ color: C.text, fontWeight: 600 }}>CDN:</strong>
            {!selectedClient?.cdn_url ? (
              <span style={{ color: C.dim }}>ej publicerad</span>
            ) : fullJson && !outputError ? (
              <><Check size={12} color="#16a34a" /> <span style={{ color: '#16a34a' }}>nås</span></>
            ) : outputError ? (
              <><X size={12} color="#dc2626" /> <span style={{ color: '#dc2626' }}>nås ej</span></>
            ) : (
              <span style={{ color: C.dim }}>kontrollerar…</span>
            )}
          </span>
        </div>
        {(() => {
          const st = jobActive['compile'] || 'idle';
          const Icon = st === 'running' ? Loader2 : st === 'success' ? Check : st === 'failed' ? X : Play;
          const color = st === 'failed' ? '#dc2626' : st === 'success' ? '#16a34a' : C.accent;
          return (
            <button
              onClick={async () => {
                if (!selected) return;
                await runJob('compile', `/api/jobs/compile/${selected}`, 'compile_schema');
                setRefreshTick((t) => t + 1);
              }}
              disabled={!selected || st === 'running'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(159,81,182,0.18)', color: C.accent, border: '1px solid rgba(159,81,182,0.3)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: !selected || st === 'running' ? 'not-allowed' : 'pointer' }}
            >
              <Icon size={13} color={color} style={st === 'running' ? { animation: 'spin 0.8s linear infinite' } : undefined} />
              {st === 'running' ? 'Kompilerar…' : 'Kompilera om'}
            </button>
          );
        })()}
      </div>

      {/* Officiell data som ingår */}
      {attested && attested.some((a) => a.included > 0 || a.staged > 0) && (
        <Card title="Officiell data i leveransen" hint="Attesterad LinkedIn-data som ingår i grafen. Staged data bekräftas på kundkortet under Officiell data.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attested.filter((a) => a.included > 0 || a.staged > 0).map((a) => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span style={{ color: C.text }}>{a.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {a.included > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600, fontSize: 12 }}>
                      <Check size={13} /> {a.included} ingår
                    </span>
                  )}
                  {a.staged > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', background: 'rgba(245,158,11,0.15)', borderRadius: 4, padding: '2px 8px' }}>
                      {a.staged} väntar på bekräftelse
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 1. Profilsida */}
      <Card title="Profilsida" hint="Den kanoniska sanningskällan AI-motorerna läser. Länken badgen pekar på.">
        {!isCompiled && (
          <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px' }}>
            Ännu inte kompilerad — kör compile-schema för att publicera sidan. URL:en nedan är den planerade adressen.
          </p>
        )}
        <Row>
          <code style={codeStyle}>{profileUrl || '—'}</code>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {profileUrl && (
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={btnStyle}>
                <ExternalLink size={14} /> Öppna
              </a>
            )}
            <button onClick={() => profileUrl && copy(profileUrl, 'profile')} style={btnStyle}>
              {copied === 'profile' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'profile' ? 'Kopierad' : 'Kopiera'}
            </button>
          </div>
        </Row>
      </Card>

      {/* 2. Identitets-snutt */}
      <Card
        title="JSON-LD identitets-snutt"
        hint="Klistras in i kundens <head> EN gång — stabil, ändras aldrig. Statisk (ingen JS) så AI-crawlers läser den. Pekar på profilsidan som kanonisk."
        action={
          delivery && (
            <CopyBtn label="snippet" copied={copied === 'identity'} onClick={() => copy(delivery.identity_snippet, 'identity')} />
          )
        }
      >
        <pre style={preStyle}>{delivery?.identity_snippet || '…'}</pre>
      </Card>

      {/* 3. Badge */}
      <Card title="Verifierings-badge" hint="Diskret komponent på kundens sajt som länkar till profilsidan.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <Control label="Tema">
            <Toggle value={theme} setValue={setTheme} options={[['light', 'Ljust'], ['dark', 'Mörkt']]} />
          </Control>
          <Control label="Form">
            <Toggle value={variant} setValue={setVariant} options={[['footer', 'Footer-länk'], ['pill', 'Flytande pill']]} />
          </Control>
          <Control label="Leverans">
            <Toggle value={mode} setValue={setMode} options={[['static', 'Statisk HTML'], ['js', 'JS-snippet']]} />
          </Control>
          <Control label="Accentfärg">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={useAccent} onChange={(e) => setUseAccent(e.target.checked)} />
              {useAccent ? (
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 32, height: 24, border: 'none', background: 'none' }} />
              ) : (
                <span style={{ color: C.muted }}>standard</span>
              )}
            </label>
          </Control>
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Förhandsvisning</div>
        <div
          style={{
            background: theme === 'dark' ? '#0f1419' : '#f4f6f7',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: badge?.preview || '' }}
        />

        <Row>
          <span style={{ fontSize: 12, color: C.muted }}>
            {mode === 'static' ? 'Statisk HTML — klistras där badgen ska visas (t.ex. footern).' : 'JS-snippet — en <script>-rad att klistra in.'}
          </span>
          {badge && <CopyBtn label="snippet" copied={copied === 'badge'} onClick={() => copy(badge.snippet, 'badge')} />}
        </Row>
        <pre style={{ ...preStyle, marginTop: 10 }}>{badge?.snippet || '…'}</pre>
      </Card>

      {/* 4. Full kompilerad JSON-LD-graf (QA — hopfällbar) */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
        <button
          onClick={() => setShowOutput((v) => !v)}
          aria-expanded={showOutput}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          {showOutput ? <ChevronDown size={16} color={C.muted} /> : <ChevronRight size={16} color={C.muted} />}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>JSON-LD-output (kompilerad graf)</h2>
            <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0', lineHeight: 1.5 }}>
              Hela Schema.org-grafen som distribueras via CDN. För granskning/QA — det är profilsidan ovan kunden faktiskt installerar.
            </p>
          </div>
        </button>

        {showOutput && (
          <div style={{ marginTop: 16 }}>
            <Row>
              <code style={codeStyle}>{cdnUrl}</code>
              <button onClick={() => copy(cdnUrl, 'cdn')} style={btnStyle}>
                {copied === 'cdn' ? <Check size={14} /> : <Copy size={14} />}
                {copied === 'cdn' ? 'Kopierad' : 'Kopiera URL'}
              </button>
            </Row>
            <div style={{ fontSize: 12, color: C.muted, margin: '14px 0 8px' }}>
              {fullJson ? `Aktuell JSON-LD för ${selectedClient?.company_name || selected}` : 'Exempel-output (ej kompilerad)'}
            </div>
            {outputError && (
              <div style={{ ...errorStyle, marginTop: 0, marginBottom: 8 }}>
                Kunde inte hämta kompilerad JSON-LD från CDN: {outputError}. Visar exempel-output.
              </div>
            )}
            <pre style={{ ...preStyle, maxHeight: 480, whiteSpace: 'pre', wordBreak: 'normal' }}>
              {fullJson || JSON.stringify(SAMPLE_JSON, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {error && (
        <div style={errorStyle}>{error}</div>
      )}
    </GraphPageShell>
  );
}

/* --- små presentationskomponenter --- */

function Card({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: hint ? 4 : 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {hint && <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px', lineHeight: 1.5 }}>{hint}</p>}
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>{children}</div>;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle<T extends string>({ value, setValue, options }: { value: T; setValue: (v: T) => void; options: [T, string][] }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => setValue(v)}
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: value === v ? 'rgba(159,81,182,0.18)' : '#eef0f1',
            color: value === v ? C.accent : C.text,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CopyBtn({ label, copied, onClick }: { label: string; copied: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(159,81,182,0.18)',
        color: copied ? '#16a34a' : C.accent,
        border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(159,81,182,0.3)'}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Kopierad' : `Kopiera ${label}`}
    </button>
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

const codeStyle: React.CSSProperties = {
  fontSize: 12,
  color: C.accent,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
};

const preStyle: React.CSSProperties = {
  background: '#eef0f1',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '14px 18px',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  lineHeight: 1.6,
  color: C.text,
  overflowX: 'auto',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'transparent',
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'none',
};

const errorStyle: React.CSSProperties = {
  marginTop: 16,
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 8,
  padding: '12px 16px',
  color: '#b91c1c',
  fontSize: 12,
};
