'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Save, Check, AlertCircle } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

type ClientIdentity = {
  logo_url: string | null;
  org_number: string | null;
};

/** Identitetsmetadata — logotyp + svenskt org.nr. Lyfts till Organization.logo +
 * Organization.identifier (PropertyValue, propertyID="SE-orgnr") på den kompilerade
 * grafen och i delivery-snippeten. Manuell input vinner alltid över framtida
 * auto-extraktion (og:image / GLEIF local-identifiers). */
export default function IdentityMetadataEditor({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    graphFetch<ClientIdentity>(`/api/clients/${clientId}`)
      .then((d) => {
        if (cancelled) return;
        setLogoUrl(d.logo_url || '');
        setOrgNumber(d.org_number || '');
        setLoaded(true);
        setDirty(false);
      })
      .catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [clientId]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const resp = await graphFetch<{ logo_url?: string | null; org_number?: string | null }>(
        `/api/clients/${clientId}/config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo_url: logoUrl, org_number: orgNumber }),
        },
      );
      // Backenden normaliserar org.nr → spegla tillbaka det normaliserade värdet i UI:t.
      if (resp.org_number !== undefined) setOrgNumber(resp.org_number || '');
      if (resp.logo_url !== undefined) setLogoUrl(resp.logo_url || '');
      setDirty(false);
      setMsg({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };
  const inp: React.CSSProperties = { padding: '8px 12px', background: '#eef0f1', color: '#3a4b56', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none', width: '100%' };
  const labelStyle: React.CSSProperties = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 6, display: 'block' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>
          <ImageIcon size={16} color={C.accent} /> Identitetsmetadata
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: dirty ? 'rgba(159,81,182,0.18)' : 'transparent', color: dirty ? '#9f51b6' : C.muted, border: `1px solid ${dirty ? 'rgba(159,81,182,0.3)' : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed' }}
        >
          <Save size={12} /> {saving ? 'Sparar…' : 'Spara'}
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '8px 12px', color: msg.tone === 'ok' ? '#16a34a' : '#b91c1c', fontSize: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      {!loaded ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : (
        <>
          <p style={{ fontSize: 11, color: C.dim, margin: '0 0 14px' }}>
            Lyfts direkt på Organization-noden i den kompilerade grafen och i kundens identitets-snippet — AI-motorerna får logotyp och hård identifierare utan att gissa via favicon eller crawla profilsidan.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
            <div>
              <label style={labelStyle}>Logotyp (URL)</label>
              <input
                value={logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setDirty(true); }}
                placeholder="https://kund.se/logo.svg"
                style={inp}
              />
              {logoUrl && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="logo-förhandsvisning" style={{ maxHeight: 36, maxWidth: 120, objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  <span style={{ fontSize: 10, color: C.dim }}>förhandsvisning</span>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Org.nr (svenskt)</label>
              <input
                value={orgNumber}
                onChange={(e) => { setOrgNumber(e.target.value); setDirty(true); }}
                placeholder="556677-8899"
                style={inp}
              />
              <p style={{ fontSize: 10, color: C.dim, margin: '6px 0 0' }}>
                Normaliseras till NNNNNN-NNNN. Lyfts som identifier (PropertyValue, propertyID=&quot;SE-orgnr&quot;).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
