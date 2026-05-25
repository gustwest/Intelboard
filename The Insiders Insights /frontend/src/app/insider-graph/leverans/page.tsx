'use client';

import { useCallback, useEffect, useState } from 'react';
import { Rocket, Copy, Check, ExternalLink } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';
import { graphFetch } from '../_lib/api';

type Client = {
  client_id: string;
  company_name: string | null;
  profile_url: string | null;
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

  // Badge-kontroller
  const [theme, setTheme] = useState<Theme>('light');
  const [variant, setVariant] = useState<Variant>('footer');
  const [mode, setMode] = useState<DeliveryMode>('static');
  const [useAccent, setUseAccent] = useState(false);
  const [accent, setAccent] = useState('#9f51b6');

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
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const q = new URLSearchParams({ theme, variant, delivery: mode });
    if (useAccent) q.set('accent', accent);
    graphFetch<Badge>(`/api/badge/${selected}?${q.toString()}`)
      .then(setBadge)
      .catch((e) => setError(e.message));
  }, [selected, theme, variant, mode, useAccent, accent]);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const profileUrl = delivery?.compiled_url || delivery?.profile_url || null;
  const isCompiled = Boolean(delivery?.compiled_url);

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
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#3a4b56', margin: 0 }}>{title}</h2>
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
            color: value === v ? '#9f51b6' : '#3a4b56',
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
        color: copied ? '#16a34a' : '#9f51b6',
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
  color: '#3a4b56',
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
  color: '#3a4b56',
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
  color: '#3a4b56',
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
