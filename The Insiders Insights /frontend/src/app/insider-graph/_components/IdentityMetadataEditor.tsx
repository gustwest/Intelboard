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
};

type Contact = { email: string; name: string | null; role: string | null; is_primary: boolean };
type ContactRow = { email: string; name: string; role: string; is_primary: boolean };

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
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [language, setLanguage] = useState('sv');
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
    setContacts((d.contacts || []).map((c) => ({
      email: c.email || '', name: c.name || '', role: c.role || '', is_primary: !!c.is_primary,
    })));
    setLanguage(d.language || 'sv');
    setLoaded(true);
    setDirty(false);
  }

  // N2-kontakthjälpare — en huvudkontakt upprätthålls i UI:t (backend saniterar också).
  function updateContact(i: number, patch: Partial<ContactRow>) {
    setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setDirty(true);
  }
  function setPrimary(i: number) {
    setContacts((cs) => cs.map((c, idx) => ({ ...c, is_primary: idx === i })));
    setDirty(true);
  }
  function addContact() {
    setContacts((cs) => [...cs, { email: '', name: '', role: '', is_primary: cs.length === 0 }]);
    setDirty(true);
  }
  function removeContact(i: number) {
    setContacts((cs) => {
      const next = cs.filter((_, idx) => idx !== i);
      if (next.length && !next.some((c) => c.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next;
    });
    setDirty(true);
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
        body: JSON.stringify({
          logo_url: logoUrl,
          org_number: orgNumber,
          // N2: skicka kontakter; backend speglar huvudkontakten → contact_email/name.
          contacts: contacts
            .map((c) => ({ email: c.email.trim(), name: c.name.trim() || null, role: c.role.trim() || null, is_primary: c.is_primary }))
            .filter((c) => c.email),
          language,
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

          {/* Leverans: kundkontakter (utskick) + profilsidans språk (Spår B/C, N2) */}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '18px 0 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Kundkontakter &amp; språk (leverans)
          </div>
          <p style={{ fontSize: 11, color: C.dim, margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Huvudkontakten</strong> får installationskit och månadsmejl. Lägg till fler vid behov (t.ex. webbansvarig) och välj vem som är huvudkontakt. Felnotiser går aldrig hit — de hanteras internt av oss.
          </p>

          {contacts.length === 0 ? (
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px', fontStyle: 'italic' }}>
              Inga kontakter ännu — leveransen når ingen förrän en huvudkontakt lagts till.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {contacts.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1.4fr 1fr 1fr auto', gap: 8, alignItems: 'center', padding: '8px 10px', background: c.is_primary ? 'rgba(224, 142, 121,0.06)' : '#fff', border: `1px solid ${c.is_primary ? C.accent : C.border}`, borderRadius: 8 }}>
                  <label title="Huvudkontakt — får kit + månadsmejl" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: c.is_primary ? C.accent : C.muted, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="radio" name="primary-contact" checked={c.is_primary} onChange={() => setPrimary(i)} style={{ accentColor: C.accent, cursor: 'pointer' }} />
                    Huvud
                  </label>
                  <UI.Input type="email" value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="vd@kund.se" style={{ width: '100%' }} />
                  <UI.Input value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} placeholder="Namn" style={{ width: '100%' }} />
                  <UI.Input value={c.role} onChange={(e) => updateContact(i, { role: e.target.value })} placeholder="Roll (valfritt)" style={{ width: '100%' }} />
                  <button onClick={() => removeContact(i)} title="Ta bort kontakt" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addContact} style={{ padding: '6px 12px', background: 'transparent', color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Lägg till kontakt
          </button>

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
