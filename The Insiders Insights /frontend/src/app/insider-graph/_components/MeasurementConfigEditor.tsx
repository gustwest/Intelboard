'use client';

import { useEffect, useState } from 'react';
import { Radar, Plus, Trash2, Save, Check, AlertCircle } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

// Håll i synk med backend: routers/clients.py (MEASUREMENT_PERSONAS, POLLING_CATEGORIES).
const PERSONAS: { id: string; label: string }[] = [
  { id: 'buyer', label: 'Köpare' },
  { id: 'candidate', label: 'Kandidat' },
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
  risk_personas: string[];
  polling_questions: Record<string, string[]>;
};

/** Per-kund mätkonfiguration (AI-synlighet): bransch-platshållare, personas, egna pollingfrågor. */
export default function MeasurementConfigEditor({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [industry, setIndustry] = useState('');
  const [topic, setTopic] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [personas, setPersonas] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    graphFetch<ClientConfig>(`/api/clients/${clientId}`)
      .then((d) => {
        if (cancelled) return;
        setIndustry(d.industry || '');
        setTopic(d.topic || '');
        setServiceArea(d.service_area || '');
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
          risk_personas: PERSONAS.map((p) => p.id).filter((id) => personas.includes(id)),
          polling_questions: cleaned,
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

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };
  const inp: React.CSSProperties = { padding: '8px 12px', background: '#eef0f1', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 6, display: 'block' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
          <Radar size={16} color={C.accent} /> Mätkonfiguration (AI-synlighet)
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: dirty ? 'rgba(159,81,182,0.18)' : 'transparent', color: dirty ? C.accent : C.muted, border: `1px solid ${dirty ? 'rgba(159,81,182,0.3)' : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed' }}
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
          {/* Bransch-platshållare — fyller {industry}/{topic}/{service_area} i default-frågorna */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Bransch (industry)</label>
              <input value={industry} onChange={(e) => { setIndustry(e.target.value); setDirty(true); }} placeholder="t.ex. molninfrastruktur" style={{ ...inp, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Område (topic)</label>
              <input value={topic} onChange={(e) => { setTopic(e.target.value); setDirty(true); }} placeholder="t.ex. AI-säkerhet" style={{ ...inp, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Tjänsteområde (service area)</label>
              <input value={serviceArea} onChange={(e) => { setServiceArea(e.target.value); setDirty(true); }} placeholder="t.ex. molnmigrering" style={{ ...inp, width: '100%' }} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: C.dim, margin: '-10px 0 18px' }}>
            Fyller platshållarna i default-frågebatteriet. Lämna tomt → generiska formuleringar (&quot;branschen&quot; m.fl.).
          </p>

          {/* Personas som riskloopen mäter */}
          <label style={labelStyle}>Personas i riskloopen</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {PERSONAS.map((p) => {
              const on = personas.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePersona(p.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: on ? 'rgba(159,81,182,0.16)' : 'transparent', color: on ? C.accent : C.muted, border: `1px solid ${on ? 'rgba(159,81,182,0.4)' : C.border}`, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {on && <Check size={12} />} {p.label}
                </button>
              );
            })}
          </div>
          {personas.length === 0 && (
            <p style={{ fontSize: 11, color: C.dim, margin: '-12px 0 18px' }}>Ingen vald → alla tre personas mäts (default).</p>
          )}

          {/* Egna pollingfrågor per kategori (tomt = default-batteriet) */}
          <label style={labelStyle}>Egna pollingfrågor</label>
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
                          <input value={q} onChange={(e) => setQ(cat.id, i, e.target.value)} placeholder="Fråga som ställs till AI-motorerna" style={inp} />
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
    </div>
  );
}
