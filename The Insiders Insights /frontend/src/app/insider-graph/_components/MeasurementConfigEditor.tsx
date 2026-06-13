'use client';

import { useEffect, useState } from 'react';
import { Radar, Plus, Trash2, Check, AlertCircle } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import * as UI from './ui';
import { graphFetch } from '../_lib/api';

// Håll i synk med backend: routers/clients.py (MEASUREMENT_PERSONAS, POLLING_CATEGORIES).
const PERSONAS: { id: string; label: string }[] = [
  { id: 'customer', label: 'Kund' },
  { id: 'talent', label: 'Talang' },
  { id: 'investor', label: 'Investerare' },
];
const CATEGORIES: { id: string; label: string }[] = [
  { id: 'affar', label: 'Affär' },
  { id: 'finans', label: 'Finans' },
  { id: 'innovation', label: 'Innovation' },
  { id: 'hr', label: 'HR' },
];

type ClientConfig = {
  industry: string | null;
  topic: string | null;
  service_area: string | null;
  measurement_ack_generic?: boolean | null;
  risk_personas: string[];
  polling_questions: Record<string, string[]>;
  measurement_language?: string | null;
};

/** Per-kund mätkonfiguration (AI-synlighet): bransch-platshållare, personas, egna pollingfrågor. */
export default function MeasurementConfigEditor({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [industry, setIndustry] = useState('');
  const [topic, setTopic] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  // A7: kvittens att tom bransch/område/tjänsteområde är medvetet (annars generisk mätning).
  const [ackGeneric, setAckGeneric] = useState(false);
  const [language, setLanguage] = useState('sv');  // F4: mätspråk för polling
  const [personas, setPersonas] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  UI.useUnsavedWarning(dirty);
  UI.useAutoDismiss(msg?.tone === 'ok', () => setMsg(null));

  useEffect(() => {
    let cancelled = false;
    graphFetch<ClientConfig>(`/api/clients/${clientId}`)
      .then((d) => {
        if (cancelled) return;
        setIndustry(d.industry || '');
        setTopic(d.topic || '');
        setServiceArea(d.service_area || '');
        setAckGeneric(!!d.measurement_ack_generic);
        setLanguage(d.measurement_language || 'sv');
        setPersonas(d.risk_personas || []);
        setQuestions(d.polling_questions || {});
        setLoaded(true);
        setDirty(false);
      })
      .catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [clientId]);

  function togglePersona(id: string) {
    setPersonas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setDirty(true);
  }
  function setQ(cat: string, i: number, val: string) {
    setQuestions((p) => ({ ...p, [cat]: (p[cat] || []).map((q, idx) => (idx === i ? val : q)) }));
    setDirty(true);
  }
  function addQ(cat: string) {
    setQuestions((p) => ({ ...p, [cat]: [...(p[cat] || []), ''] }));
    setDirty(true);
  }
  function removeQ(cat: string, i: number) {
    setQuestions((p) => ({ ...p, [cat]: (p[cat] || []).filter((_, idx) => idx !== i) }));
    setDirty(true);
  }

  async function save() {
    // A7: tom bransch/område/tjänsteområde → kräv medveten kvittens (annars generisk mätning).
    if (!industry.trim() && !topic.trim() && !serviceArea.trim() && !ackGeneric) {
      setMsg({ tone: 'error', text: 'Fyll i bransch/område/tjänsteområde — eller kryssa i att mätningen får vara generisk.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      // Trimma + släng tomma frågor; kategorier som blir tomma faller tillbaka till defaults.
      const cleaned: Record<string, string[]> = {};
      for (const { id } of CATEGORIES) {
        const kept = (questions[id] || []).map((q) => q.trim()).filter(Boolean);
        if (kept.length) cleaned[id] = kept;
      }
      await graphFetch(`/api/clients/${clientId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry,
          topic,
          service_area: serviceArea,
          measurement_ack_generic: ackGeneric,
          risk_personas: PERSONAS.map((p) => p.id).filter((id) => personas.includes(id)),
          polling_questions: cleaned,
          measurement_language: language,
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

  const inp: React.CSSProperties = { padding: '8px 12px', background: '#eceae3', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none' };

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
          <Radar size={16} color={C.accent} /> Mätkonfiguration (AI-synlighet)
        </div>
        <UI.SaveButton dirty={dirty} saving={saving} onClick={save} />
      </div>

      {msg && (
        <UI.StatusBanner
          tone={msg.tone === 'ok' ? 'ok' : 'err'}
          icon={msg.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          style={{ marginBottom: 12 }}
        >
          {msg.text}
        </UI.StatusBanner>
      )}

      {!loaded ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : (
        <>
          {/* F4: mätspråk — styr vilket default-frågebatteri (sv/en) som ställs varje vecka.
              Skilt från profilsidans språk. Byte markeras som jämförbarhetsbrott i veckovyn. */}
          <div style={{ marginBottom: 18 }}>
            <UI.FieldLabel>Mätspråk (frågespråk)</UI.FieldLabel>
            <select
              value={language}
              onChange={(e) => { setLanguage(e.target.value); setDirty(true); }}
              style={{ ...inp, width: 220, cursor: 'pointer' }}
            >
              <option value="sv">Svenska</option>
              <option value="en">Engelska</option>
            </select>
            <p style={{ fontSize: 11, color: C.dim, margin: '6px 0 0' }}>
              Citerbarhet är språkspecifik — engelska kan ge en annan synlighetsbild. Resultat medeltalas aldrig över språk; byte bryter trendjämförbarheten. Egna frågor nedan är språkagnostiska.
            </p>
          </div>

          {/* Bransch-platshållare — fyller {industry}/{topic}/{service_area} i default-frågorna */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
            <div>
              <UI.FieldLabel>Bransch (industry)</UI.FieldLabel>
              <UI.Input value={industry} onChange={(e) => { setIndustry(e.target.value); setDirty(true); }} placeholder="t.ex. molninfrastruktur" style={{ width: '100%' }} />
            </div>
            <div>
              <UI.FieldLabel>Område (topic)</UI.FieldLabel>
              <UI.Input value={topic} onChange={(e) => { setTopic(e.target.value); setDirty(true); }} placeholder="t.ex. AI-säkerhet" style={{ width: '100%' }} />
            </div>
            <div>
              <UI.FieldLabel>Tjänsteområde (service area)</UI.FieldLabel>
              <UI.Input value={serviceArea} onChange={(e) => { setServiceArea(e.target.value); setDirty(true); }} placeholder="t.ex. molnmigrering" style={{ width: '100%' }} />
            </div>
          </div>
          {/* A7: förklara EFFEKTEN + visa en live exempel-fråga så "rätt beskrivning" blir konkret. */}
          <p style={{ fontSize: 11, color: C.dim, margin: '-6px 0 8px', lineHeight: 1.5 }}>
            Fyller frågorna AI-motorerna får om er marknad — ju mer specifikt, desto mer meningsfull mätning.
            Exempel: <em style={{ color: C.muted }}>&quot;Vilka är de ledande svenska bolagen inom {industry.trim() || 'branschen'}?&quot;</em>{' '}
            <em style={{ color: C.muted }}>&quot;Vilka företag rekommenderar du för {serviceArea.trim() || 'deras tjänster'}?&quot;</em>
          </p>
          {!industry.trim() && !topic.trim() && !serviceArea.trim() && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#b45309', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '8px 10px', margin: '0 0 18px', cursor: 'pointer' }}>
              <input type="checkbox" checked={ackGeneric} onChange={(e) => { setAckGeneric(e.target.checked); setDirty(true); }} style={{ marginTop: 2, cursor: 'pointer' }} />
              <span>Inga fält ifyllda. Jag förstår att AI-synlighetsmätningen då blir <strong>generisk och inte meningsfull</strong> för den här kunden.</span>
            </label>
          )}

          {/* Målgrupper som riskloopen ställer frågor som */}
          <UI.FieldLabel>Målgrupper i riskloopen</UI.FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {PERSONAS.map((p) => {
              const on = personas.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePersona(p.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: on ? 'rgba(224, 142, 121,0.16)' : 'transparent', color: on ? C.accent : C.muted, border: `1px solid ${on ? 'rgba(224, 142, 121,0.4)' : C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {on && <Check size={12} />} {p.label}
                </button>
              );
            })}
          </div>
          {personas.length === 0 && (
            <p style={{ fontSize: 11, color: C.dim, margin: '-12px 0 18px' }}>Ingen vald → alla tre målgrupper mäts (default).</p>
          )}

          {/* Egna pollingfrågor per kategori (tomt = default-batteriet) */}
          <UI.FieldLabel>Egna pollingfrågor</UI.FieldLabel>
          <p style={{ fontSize: 11, color: C.dim, margin: '0 0 12px' }}>
            Ersätter default-frågorna per kategori. Tomma kategorier använder defaults (med platshållarna ovan).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CATEGORIES.map((cat) => {
              const qs = questions[cat.id] || [];
              return (
                <div key={cat.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                      {cat.label}
                      {qs.length === 0 && <span style={{ fontSize: 11, color: C.dim, fontWeight: 400, marginLeft: 8 }}>använder default</span>}
                    </span>
                    <button onClick={() => addQ(cat.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={12} /> Lägg till
                    </button>
                  </div>
                  {qs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {qs.map((q, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 36px', gap: 8 }}>
                          <UI.Input value={q} onChange={(e) => setQ(cat.id, i, e.target.value)} placeholder="Fråga som ställs till AI-motorerna" />
                          <button onClick={() => removeQ(cat.id, i)} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </UI.Card>
  );
}
