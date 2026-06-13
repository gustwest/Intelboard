'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Check, AlertCircle, Download, Loader2 } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import * as UI from './ui';
import { graphFetch } from '../_lib/api';
import { fmtDate } from '@/lib/datetime';

type ClientIdentity = {
  logo_url: string | null;
  logo_url_source: 'manual' | 'website' | 'gleif' | 'auto' | null;
  logo_url_set_at: string | null;
  org_number: string | null;
  org_number_source: 'manual' | 'gleif' | 'website' | 'auto' | null;
  org_number_set_at: string | null;
  // Leverans (Spår B/C): kundkontakter för utskick + profilsidans språk (N2).
  contacts: Contact[];
  language: string;
  active_connectors: string[];  // ON3: "Hämta automatiskt" kräver website-connectorn
  // Parity v2: ledningens/styrelsens kvinnoandel ur officiell källa. Polling
  // snapshotar fältet veckovis → parity_gap (porträtterad − baseline).
  parity_baseline: { value: number; source: string; as_of: string | null; set_at?: string } | null;
};

type Contact = { email: string; name: string | null; role: string | null; is_primary: boolean };

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
  const [language, setLanguage] = useState('sv');
  // Paritets-baseline: procent som text i UI:t (45 = 45 %), andel 0–1 mot API:t.
  const [parityPct, setParityPct] = useState('');
  const [paritySource, setParitySource] = useState('');
  const [parityAsOf, setParityAsOf] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  UI.useUnsavedWarning(dirty);
  UI.useAutoDismiss(msg?.tone === 'ok', () => setMsg(null));

  async function load() {
    const d = await graphFetch<ClientIdentity>(`/api/clients/${clientId}`);
    setIdentity(d);
    setLogoUrl(d.logo_url || '');
    setOrgNumber(d.org_number || '');
    setLanguage(d.language || 'sv');
    setParityPct(d.parity_baseline ? String(Math.round(d.parity_baseline.value * 1000) / 10) : '');
    setParitySource(d.parity_baseline?.source || '');
    setParityAsOf(d.parity_baseline?.as_of || '');
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
    // Procent i UI → andel 0–1 mot API:t. Tomt fält = rensa (value: null).
    const pct = parityPct.trim() ? Number(parityPct.replace(',', '.')) : null;
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setMsg({ tone: 'error', text: 'Kvinnoandel måste vara ett tal 0–100 (%).' });
      setSaving(false);
      return;
    }
    try {
      await graphFetch(`/api/clients/${clientId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logo_url: logoUrl,
          org_number: orgNumber,
          language,
          parity_baseline: pct === null
            ? { value: null }
            : { value: pct / 100, source: paritySource.trim(), as_of: parityAsOf.trim() || null },
        }),
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

  // ON3: auto-hämtningen läser från senaste webbplats-scrape → kräver att website-
  // connectorn är aktiv. Visa det FÖRE klick (disable + hint) i st f 422/info efteråt.
  const hasWebsite = !!identity?.active_connectors?.includes('website');

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
          <ImageIcon size={16} color={C.accent} /> Identitetsmetadata
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchAuto}
            disabled={fetching || !loaded || !hasWebsite}
            title={!loaded ? '' : !hasWebsite ? 'Kräver webbplats-connectorn — aktivera den under Datakällor först. Auto-hämtningen läser logo/org.nr från hemsidans scrape.' : 'Lyft logo/org.nr från senaste scrape-data (rör inte manuellt satta fält). Tunga om-scrapes körs via Uppdatera profil eller cron.'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: fetching || !loaded || !hasWebsite ? 'not-allowed' : 'pointer', opacity: loaded && !hasWebsite ? 0.55 : 1 }}
          >
            {fetching ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
            {fetching ? 'Hämtar…' : 'Hämta automatiskt'}
          </button>
          <UI.SaveButton dirty={dirty} saving={saving} onClick={save} />
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 1s linear infinite; }`}</style>

      {msg && (
        <UI.StatusBanner
          tone={msg.tone === 'ok' ? 'ok' : msg.tone === 'error' ? 'err' : 'info'}
          icon={msg.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          style={{ marginBottom: 12 }}
        >
          {msg.text}
        </UI.StatusBanner>
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
              <UI.FieldLabel>Logotyp (URL)</UI.FieldLabel>
              <UI.Input
                value={logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setDirty(true); }}
                placeholder="https://kund.se/logo.svg"
                style={{ width: '100%' }}
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
              <UI.FieldLabel>Org.nr (svenskt)</UI.FieldLabel>
              <UI.Input
                value={orgNumber}
                onChange={(e) => { setOrgNumber(e.target.value); setDirty(true); }}
                placeholder="556677-8899"
                style={{ width: '100%' }}
              />
              <ProvenanceLine source={identity.org_number_source} setAt={identity.org_number_set_at} hasValue={!!identity.org_number} />
              <p style={{ fontSize: 10, color: C.dim, margin: '6px 0 0' }}>
                Normaliseras till NNNNNN-NNNN. Lyfts som identifier (PropertyValue, propertyID=&quot;SE-orgnr&quot;).
              </p>
            </div>
          </div>

          {/* Leverans: profilsidans språk. Kundkontakter (utskick) flyttade till Mejlutskick-fliken (B4). */}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '18px 0 14px' }} />

          <div style={{ marginTop: 18 }}>
            <UI.FieldLabel>Profilsidans språk</UI.FieldLabel>
            <UI.SegmentedToggle
              value={language}
              onChange={(v: string) => { setLanguage(v); setDirty(true); }}
              options={[{ value: 'sv', label: 'Svenska' }, { value: 'en', label: 'Engelska' }]}
            />
            <p style={{ fontSize: 10, color: C.dim, margin: '6px 0 0' }}>
              Styr etiketter/rubriker på profilsidan + inLanguage i JSON-LD. Default svenska.
            </p>
          </div>

          {/* Parity v2: ledningsbaseline — gap = AI:s framlyfta personer vs formell ledning */}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '18px 0 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Paritets-baseline (ledning/styrelse)
          </div>
          <p style={{ fontSize: 11, color: C.dim, margin: '0 0 12px' }}>
            Kvinnoandel i kundens <strong style={{ color: C.text }}>formella ledning/styrelse</strong> ur
            officiell källa (årsredovisning, Bolagsverket). Veckomätningen jämför vilka personer
            AI-motorerna lyfter fram mot denna baseline — gapet är insikten. Tomt fält = ingen
            gap-beräkning. Källa krävs när andel anges.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1.6fr 150px', gap: 10, alignItems: 'start' }}>
            <div>
              <UI.FieldLabel>Kvinnoandel %</UI.FieldLabel>
              <UI.Input
                value={parityPct}
                onChange={(e) => { setParityPct(e.target.value); setDirty(true); }}
                placeholder="45"
                inputMode="decimal"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <UI.FieldLabel>Källa</UI.FieldLabel>
              <UI.Input
                value={paritySource}
                onChange={(e) => { setParitySource(e.target.value); setDirty(true); }}
                placeholder="Årsredovisning 2025, s. 12"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <UI.FieldLabel>Avser datum</UI.FieldLabel>
              <UI.Input
                type="date"
                value={parityAsOf}
                onChange={(e) => { setParityAsOf(e.target.value); setDirty(true); }}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          {identity.parity_baseline?.set_at && (
            <div style={{ fontSize: 10, color: '#6b6e7e', marginTop: 6, fontStyle: 'italic' }}>
              manuellt satt {formatDate(identity.parity_baseline.set_at)}
              {identity.parity_baseline.source ? ` · ${identity.parity_baseline.source}` : ''}
            </div>
          )}
        </>
      )}
    </UI.Card>
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
    <div style={{ fontSize: 10, color: '#6b6e7e', marginTop: 4, fontStyle: 'italic' }}>
      {text}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return fmtDate(d);
  } catch {
    return iso.slice(0, 10);
  }
}
