'use client';

import { useEffect, useState } from 'react';
import { Target, Sparkles, Plus, Trash2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import * as UI from './ui';
import { graphFetch } from '../_lib/api';

// Audience-typer — håll i synk med services/output_quality.py (AUDIENCE_TYPES)
const AUDIENCE_LABELS: Record<string, { label: string; emoji: string; hint: string }> = {
  customer: { label: 'Kunder', emoji: '🛒', hint: 'Köpare/prospekt av tjänsten' },
  candidate: { label: 'Kandidater', emoji: '🎯', hint: 'Talanger ni vill rekrytera (employer brand)' },
  investor: { label: 'Investerare', emoji: '💰', hint: 'Kapital eller börspublik' },
};
const ORDER: ('customer' | 'candidate' | 'investor')[] = ['customer', 'candidate', 'investor'];

type Persona = {
  role: string;
  industry?: string | null;
  company_size?: string | null;
  description?: string | null;
};

type AudiencePriority = {
  audience_type: 'customer' | 'candidate' | 'investor';
  weight: number;
  personas: Persona[];
  narrative_axes: string[];
};

type ClientPayload = {
  audience_priorities: AudiencePriority[] | null;
  audience_priorities_set_at: string | null;
};

/** Per-kund audience-priorities: driver output-kvalitets-rubric:en.
 *  Användaren kan klicka "Auto-härled" för att låta backend föreslå utifrån
 *  hemsidan + jobbannonser, redigera, och spara. */
export default function AudiencePrioritiesEditor({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [priorities, setPriorities] = useState<AudiencePriority[]>([]);
  const [setAt, setSetAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deriving, setDeriving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [derivedPreview, setDerivedPreview] = useState<AudiencePriority[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    graphFetch<ClientPayload>(`/api/clients/${clientId}`)
      .then((d) => {
        if (cancelled) return;
        setPriorities(d.audience_priorities || []);
        setSetAt(d.audience_priorities_set_at);
        setLoaded(true);
        setDirty(false);
      })
      .catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [clientId]);

  function patch(idx: number, mut: (p: AudiencePriority) => AudiencePriority) {
    setPriorities((arr) => arr.map((p, i) => (i === idx ? mut(p) : p)));
    setDirty(true);
  }

  function addAudience(type: 'customer' | 'candidate' | 'investor') {
    if (priorities.some((p) => p.audience_type === type)) return;
    setPriorities((arr) => [...arr, { audience_type: type, weight: 0.5, personas: [], narrative_axes: [] }]);
    setDirty(true);
  }
  function removeAudience(idx: number) {
    setPriorities((arr) => arr.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function addPersona(idx: number) {
    patch(idx, (p) => ({ ...p, personas: [...p.personas, { role: '' }] }));
  }
  function removePersona(idx: number, pidx: number) {
    patch(idx, (p) => ({ ...p, personas: p.personas.filter((_, i) => i !== pidx) }));
  }
  function setPersonaField(idx: number, pidx: number, field: keyof Persona, val: string) {
    patch(idx, (p) => ({
      ...p,
      personas: p.personas.map((pp, i) => (i === pidx ? { ...pp, [field]: val } : pp)),
    }));
  }
  function addAxis(idx: number) {
    patch(idx, (p) => ({ ...p, narrative_axes: [...p.narrative_axes, ''] }));
  }
  function setAxis(idx: number, aidx: number, val: string) {
    patch(idx, (p) => ({ ...p, narrative_axes: p.narrative_axes.map((a, i) => (i === aidx ? val : a)) }));
  }
  function removeAxis(idx: number, aidx: number) {
    patch(idx, (p) => ({ ...p, narrative_axes: p.narrative_axes.filter((_, i) => i !== aidx) }));
  }

  async function deriveFromData() {
    setDeriving(true);
    setMsg(null);
    try {
      const result = await graphFetch<{ audience_priorities: AudiencePriority[]; source_counts: Record<string, number> }>(
        `/api/clients/${clientId}/derive-personas`,
        { method: 'POST' },
      );
      setDerivedPreview(result.audience_priorities);
      const { website, jobfeed } = result.source_counts;
      setMsg({
        tone: 'info',
        text: `Förslag baserat på ${website ?? 0} hemsidesidor + ${jobfeed ?? 0} jobbannonser. Granska och klicka "Använd förslag" för att ersätta.`,
      });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDeriving(false);
    }
  }

  function applyDerived() {
    if (!derivedPreview) return;
    setPriorities(derivedPreview);
    setDerivedPreview(null);
    setDirty(true);
    setMsg({ tone: 'info', text: 'Förslag inläst — granska och klicka "Spara" för att skriva.' });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // Trimma tomma personas/axes innan vi sparar
      const cleaned = priorities
        .map((p) => ({
          ...p,
          personas: p.personas.filter((pp) => pp.role && pp.role.trim()),
          narrative_axes: p.narrative_axes.map((a) => a.trim()).filter(Boolean),
        }))
        .filter((p) => p.personas.length > 0 || p.narrative_axes.length > 0);

      const result = await graphFetch<{ audience_priorities_set_at: string }>(
        `/api/clients/${clientId}/config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience_priorities: cleaned }),
        },
      );
      setPriorities(cleaned);
      setSetAt(result.audience_priorities_set_at);
      setDirty(false);
      setMsg({ tone: 'ok', text: 'Sparat' });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = { padding: '8px 12px', background: '#eef0f1', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: 'none' };

  const missingAudiences = ORDER.filter((t) => !priorities.some((p) => p.audience_type === t));

  return (
    <UI.Card padding="18px 20px" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
          <Target size={16} color={C.accent} /> Persona-targets (output-kvalitet)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={deriveFromData}
            disabled={deriving}
            title="Härled ur hemsidedata + jobbannonser via LLM"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: deriving ? 'wait' : 'pointer' }}
          >
            {deriving ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={12} />}
            {deriving ? 'Härleder…' : 'Auto-härled'}
          </button>
          <UI.SaveButton dirty={dirty} saving={saving} onClick={save} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: C.dim, margin: '0 0 14px' }}>
        Driver output-kvalitets-rubric:en — vilka målgrupper (kunder/kandidater/investerare) ni vill bli citerade av i AI-svar.
        {setAt && <> Senast sparat: {new Date(setAt).toLocaleString('sv-SE')}.</>}
      </p>

      {msg && (
        <UI.StatusBanner
          tone={msg.tone === 'ok' ? 'ok' : msg.tone === 'error' ? 'err' : 'info'}
          icon={msg.tone === 'ok' ? <Check size={14} /> : msg.tone === 'error' ? <AlertCircle size={14} /> : <Sparkles size={14} />}
          style={{ marginBottom: 12 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <span style={{ flex: 1 }}>{msg.text}</span>
            {derivedPreview && msg.tone === 'info' && (
              <button
                onClick={applyDerived}
                style={{ padding: '4px 10px', background: 'rgba(159,81,182,0.18)', color: C.accent, border: '1px solid rgba(159,81,182,0.4)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Använd förslag
              </button>
            )}
          </span>
        </UI.StatusBanner>
      )}

      {!loaded ? (
        <div style={{ fontSize: 12, color: C.muted }}>Laddar…</div>
      ) : priorities.length === 0 && !derivedPreview ? (
        <div style={{ padding: '20px 16px', textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12 }}>
          Inga audience-targets satta än. Klicka <strong>Auto-härled</strong> för att låta backend föreslå utifrån er data,
          eller lägg till manuellt nedan.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {priorities.map((p, idx) => {
            const meta = AUDIENCE_LABELS[p.audience_type];
            return (
              <div key={p.audience_type} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{meta.emoji}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{meta.label}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{meta.hint}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeAudience(idx)}
                    title="Ta bort audience"
                    style={{ padding: '5px 8px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', display: 'flex' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Vikt:</label>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={p.weight}
                    onChange={(e) => patch(idx, (pp) => ({ ...pp, weight: parseFloat(e.target.value) }))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 12, color: C.text, fontWeight: 600, minWidth: 36 }}>{p.weight.toFixed(2)}</span>
                </div>

                {/* Personas */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <UI.FieldLabel>Personor</UI.FieldLabel>
                    <button onClick={() => addPersona(idx)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={11} /> Lägg till
                    </button>
                  </div>
                  {p.personas.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.dim, padding: '4px 0' }}>Inga personor — lägg till minst en.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.personas.map((pp, pidx) => (
                        <div key={pidx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 36px', gap: 6 }}>
                          <UI.Input value={pp.role} onChange={(e) => setPersonaField(idx, pidx, 'role', e.target.value)} placeholder="Roll (t.ex. CXO)" />
                          <UI.Input value={pp.industry || ''} onChange={(e) => setPersonaField(idx, pidx, 'industry', e.target.value)} placeholder="Bransch" />
                          <UI.Input value={pp.company_size || ''} onChange={(e) => setPersonaField(idx, pidx, 'company_size', e.target.value)} placeholder="Storlek" />
                          <button onClick={() => removePersona(idx, pidx)} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Berättelseaxlar */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <UI.FieldLabel>Berättelseaxlar (3–5)</UI.FieldLabel>
                    <button onClick={() => addAxis(idx)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={11} /> Lägg till
                    </button>
                  </div>
                  {p.narrative_axes.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.dim, padding: '4px 0' }}>Vad ni vill bli kända för i den här audiencen.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.narrative_axes.map((a, aidx) => (
                        <div key={aidx} style={{ display: 'grid', gridTemplateColumns: '1fr 36px', gap: 6 }}>
                          <UI.Input value={a} onChange={(e) => setAxis(idx, aidx, e.target.value)} placeholder="t.ex. praktisk AI utan hype" />
                          <button onClick={() => removeAxis(idx, aidx)} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {missingAudiences.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Lägg till audience:</span>
              {missingAudiences.map((t) => (
                <button
                  key={t}
                  onClick={() => addAudience(t)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Plus size={11} /> {AUDIENCE_LABELS[t].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </UI.Card>
  );
}
