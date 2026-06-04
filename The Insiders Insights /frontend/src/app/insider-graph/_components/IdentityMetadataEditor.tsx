'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Save, Check, AlertCircle, Download, Loader2 } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

type ClientIdentity = {
  logo_url: string | null;
  logo_url_source: 'manual' | 'website' | 'gleif' | 'auto' | null;
  logo_url_set_at: string | null;
  org_number: string | null;
  org_number_source: 'manual' | 'gleif' | 'website' | 'auto' | null;
  org_number_set_at: string | null;
};

type EnrichResponse = {
  client_id: string;
  updates: Record<string, { value: string; source: string; set_at: string }>;
  no_data_for: string[];
};

/** Identitetsmetadata — logotyp + svenskt org.nr. Lyfts till Organization.logo +
 * Organization.identifier (PropertyValue, propertyID="SE-orgnr") på den kompilerade
 * grafen och i delivery-snippeten.
 *
 * Per-fält provenance ("manuellt satt 2026-05-27" / "auto från website 2026-05-26")
 * visas under varje input — ops ska aldrig undra varifrån ett värde kom. Knappen
 * "Hämta automatiskt" gör lift-only på BEFINTLIG rådata (snabbt, ingen scrape);
 * full force-hämtning sker via "Uppdatera profil" eller schemalagda jobb. */
export default function IdentityMetadataEditor({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [identity, setIdentity] = useState<ClientIdentity | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  async function load() {
    const d = await graphFetch<ClientIdentity>(`/api/clients/${clientId}`);
    setIdentity(d);
    setLogoUrl(d.logo_url || '');
    setOrgNumber(d.org_number || '');
    setLoaded(true);
    setDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    load().catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await graphFetch(`/api/clients/${clientId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: logoUrl, org_number: orgNumber }),
      });
      await load();
      setMsg({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function fetchAuto() {
    setFetching(true);
    setMsg(null);
    try {
      const resp = await graphFetch<EnrichResponse>(`/api/clients/${clientId}/enrich-identity`, {
        method: 'POST',
      });
      await load();
      // Bygg ett ärligt sammanfattnings-meddelande av updates + no_data_for.
      const updatedNames = Object.keys(resp.updates).map(fieldLabel);
      const missingNames = resp.no_data_for.map(fieldLabel);
      if (updatedNames.length === 0 && missingNames.length === 0) {
        setMsg({ tone: 'info', text: 'Båda fälten är redan satta — inget att uppdatera.' });
      } else if (updatedNames.length > 0 && missingNames.length === 0) {
        const sources = Object.entries(resp.updates).map(([k, v]) => `${fieldLabel(k)} från ${v.source}`).join(', ');
        setMsg({ tone: 'ok', text: `Hämtade: ${sources}` });
      } else if (updatedNames.length === 0 && missingNames.length > 0) {
        setMsg({
          tone: 'info',
          text: `Ingen data hittad för ${missingNames.join(', ')} i nuvarande material. Kör "Uppdatera profil" för en fresh scrape först.`,
        });
      } else {
        const sources = Object.entries(resp.updates).map(([k, v]) => `${fieldLabel(k)} från ${v.source}`).join(', ');
        setMsg({
          tone: 'ok',
          text: `Hämtade: ${sources}. ${missingNames.join(', ')}: ingen data i nuvarande material.`,
        });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setFetching(false);
    }
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };
  const inp: React.CSSProperties = { padding: '8px 12px', background: '#eef0f1', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none', width: '100%' };
  const labelStyle: React.CSSProperties = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 6, display: 'block' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
          <ImageIcon size={16} color={C.accent} /> Identitetsmetadata
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchAuto}
            disabled={fetching || !loaded}
            title="Lyft logo/org.nr från senaste scrape-data (rör inte manuellt satta fält). Tunga om-scrapes körs via Uppdatera profil eller cron."
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: fetching || !loaded ? 'not-allowed' : 'pointer' }}
          >
            {fetching ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
            {fetching ? 'Hämtar…' : 'Hämta automatiskt'}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: dirty ? 'rgba(159,81,182,0.18)' : 'transparent', color: dirty ? C.accent : C.muted, border: `1px solid ${dirty ? 'rgba(159,81,182,0.3)' : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed' }}
          >
            <Save size={12} /> {saving ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 1s linear infinite; }`}</style>

      {msg && (
        <div style={{
          background: msg.tone === 'ok' ? 'rgba(34,197,94,0.1)' : msg.tone === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(159,81,182,0.1)',
          border: `1px solid ${msg.tone === 'ok' ? 'rgba(34,197,94,0.3)' : msg.tone === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(159,81,182,0.3)'}`,
          borderRadius: 8, padding: '8px 12px',
          color: msg.tone === 'ok' ? '#16a34a' : msg.tone === 'error' ? '#b91c1c' : '#7d3b94',
          fontSize: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {msg.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      {!loaded || !identity ? (
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
              <ProvenanceLine source={identity.logo_url_source} setAt={identity.logo_url_set_at} hasValue={!!identity.logo_url} />
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
              <ProvenanceLine source={identity.org_number_source} setAt={identity.org_number_set_at} hasValue={!!identity.org_number} />
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

function fieldLabel(field: string): string {
  return field === 'logo_url' ? 'logotyp' : field === 'org_number' ? 'org.nr' : field;
}

function ProvenanceLine({ source, setAt, hasValue }: { source: string | null; setAt: string | null; hasValue: boolean }) {
  const sourceLabels: Record<string, string> = {
    manual: 'manuellt satt',
    website: 'auto från website',
    gleif: 'auto från GLEIF',
    auto: 'auto-fyllt',
  };
  let text: string;
  if (!hasValue) {
    text = 'ej hämtat ännu';
  } else if (source && setAt) {
    text = `${sourceLabels[source] || source} ${formatDate(setAt)}`;
  } else if (source) {
    text = sourceLabels[source] || source;
  } else {
    text = 'okänd källa';
  }
  return (
    <div style={{ fontSize: 10, color: '#6a7e8a', marginTop: 4, fontStyle: 'italic' }}>
      {text}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE');
  } catch {
    return iso.slice(0, 10);
  }
}
