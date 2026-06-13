'use client';

import { useEffect, useState } from 'react';
import { graphColors as C } from './GraphPageShell';
import * as UI from './ui';
import { graphFetch } from '../_lib/api';

type Contact = { email: string; name: string | null; role: string | null; is_primary: boolean };
type ContactRow = { email: string; name: string; role: string; is_primary: boolean };

/** Mejlutskick (Spår B/B4) — kundkontakter som tar emot installationskit + månadsmejl.
 *
 * Bröts ut ur IdentityMetadataEditor: kontakter (utskicks-MOTTAGARE) hör till mejlutskick,
 * medan profilsidans språk är leverans-/output-config och stannar i Leverans & kvalitet.
 * Sparar BARA `contacts` via PUT /config (partiell merge — backend rör ej logo/org.nr/
 * språk/parity som utelämnas). Utskicksfrekvens (kadens) + innehåll (B4b) styrs i samma flik. */
export default function MejlutskickEditor({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [cadence, setCadence] = useState('monthly');               // B4b: utskicksfrekvens
  const [includeAlignment, setIncludeAlignment] = useState(true);  // B4b: frivilliga åtgärdsförslag
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  UI.useUnsavedWarning(dirty);
  UI.useAutoDismiss(msg?.tone === 'ok', () => setMsg(null));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await graphFetch<{ contacts: Contact[]; email_cadence?: string; email_include_alignment?: boolean }>(`/api/clients/${clientId}`);
      if (cancelled) return;
      setContacts((d.contacts || []).map((c) => ({
        email: c.email || '', name: c.name || '', role: c.role || '', is_primary: !!c.is_primary,
      })));
      setCadence(d.email_cadence || 'monthly');
      setIncludeAlignment(d.email_include_alignment !== false);
      setLoaded(true);
    })().catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [clientId]);

  // Kontakthjälpare — en huvudkontakt upprätthålls i UI:t (backend saniterar också).
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

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // Partiell merge: bara contacts → logo/org.nr/språk/parity rörs ej (ClientConfigUpdate).
      await graphFetch(`/api/clients/${clientId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: contacts
            .map((c) => ({ email: c.email.trim(), name: c.name.trim() || null, role: c.role.trim() || null, is_primary: c.is_primary }))
            .filter((c) => c.email),
          email_cadence: cadence,
          email_include_alignment: includeAlignment,
        }),
      });
      setDirty(false);
      setMsg({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Mejlutskick — mottagare</div>
        <UI.SaveButton dirty={dirty} saving={saving} onClick={save} />
      </div>
      {msg && (
        <UI.StatusBanner tone={msg.tone === 'ok' ? 'ok' : msg.tone === 'error' ? 'err' : 'info'} style={{ marginBottom: 12 }}>{msg.text}</UI.StatusBanner>
      )}
      <p style={{ fontSize: 11, color: C.dim, margin: '0 0 12px' }}>
        <strong style={{ color: C.text }}>Huvudkontakten</strong> får installationskit och månadsmejl. Lägg till fler vid behov (t.ex. webbansvarig) och välj vem som är huvudkontakt. Felnotiser går aldrig hit — de hanteras internt av oss.
      </p>

      {!loaded ? null : contacts.length === 0 ? (
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

      {/* B4b: hur ofta + vad. Mottagarna (ovan) = VILKA; detta = FREKVENS + INNEHÅLL. */}
      <div style={{ borderTop: `1px solid ${C.border}`, margin: '18px 0 12px' }} />
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>Utskick</div>
      <UI.FieldLabel>Hur ofta</UI.FieldLabel>
      <UI.SegmentedToggle
        value={cadence}
        onChange={(v: string) => { setCadence(v); setDirty(true); }}
        options={[
          { value: 'monthly', label: 'Månadsvis' },
          { value: 'quarterly', label: 'Kvartalsvis' },
          { value: 'off', label: 'Av' },
        ]}
      />
      <p style={{ fontSize: 10, color: C.dim, margin: '6px 0 14px' }}>
        Kvartalsvis = mars/juni/sep/dec. Av = inga återkommande utskick. Manuell sändning påverkas inte.
      </p>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: C.text, cursor: 'pointer' }}>
        <input type="checkbox" checked={includeAlignment} onChange={(e) => { setIncludeAlignment(e.target.checked); setDirty(true); }} style={{ marginTop: 2, cursor: 'pointer' }} />
        <span>Inkludera frivilliga åtgärdsförslag (frågor AI-motorer ställer som profilen inte svarar på)</span>
      </label>
    </UI.Card>
  );
}
