'use client';

import { useEffect, useState } from 'react';
import { Users, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';
import * as UI from './ui';

// Speglar services/persona_registry — men hämtas live från /api/personas/registry
// så vi aldrig hårdkodar paletten på två ställen.
type ProbeTemplate = { neutral: string; adversarial: string };
type PersonaDef = {
  id: string;
  label_sv: string;
  description_sv: string;
  schema_audience_type: string;
  is_default: boolean;
  default_channels: string[];
  probe_templates: Record<string, ProbeTemplate>;
};
type RegistryResp = {
  personas: PersonaDef[];
  defaults: string[];
  max_active: number;
};

// Dimension-slug → svensk rubrik (för template-vyn). Matchar humanization_config.DIMENSIONS.
const DIMENSION_LABELS: Record<string, string> = {
  inclusion: 'Mångfald & inkludering',
  wellbeing: 'Välmående & arbetsmiljö',
  transparency: 'Transparens & villkor',
  ethics: 'Etik & styrning',
  development: 'Lärande & utveckling',
  community: 'Samhällsengagemang',
};

/**
 * Persona-palett (Fas 2.1g): operatören väljer vilka målgrupper warmth-probarna
 * mäter (max N aktiva). Visar också probe-templates read-only (Nivå 2) så ops
 * kan kvalitetskolla frågorna — edit sker i services/persona_registry.py.
 */
export default function PersonaPaletteEditor({ clientId }: { clientId: string }) {
  const [registry, setRegistry] = useState<RegistryResp | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  UI.useUnsavedWarning(dirty);
  UI.useAutoDismiss(msg?.tone === 'ok', () => setMsg(null));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      graphFetch<RegistryResp>('/api/personas/registry'),
      graphFetch<{ personas: string[] }>(`/api/clients/${clientId}`),
    ])
      .then(([reg, client]) => {
        if (cancelled) return;
        setRegistry(reg);
        setActive(client.personas || reg.defaults);
        setLoaded(true);
        setDirty(false);
      })
      .catch((e) => { if (!cancelled) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [clientId]);

  const maxActive = registry?.max_active ?? 5;
  const atCap = active.length >= maxActive;

  function toggle(id: string) {
    setActive((cur) => {
      if (cur.includes(id)) {
        // Skydda mot att tömma helt — minst en aktiv persona krävs.
        if (cur.length === 1) {
          setMsg({ tone: 'error', text: 'Minst en persona måste vara aktiv.' });
          return cur;
        }
        return cur.filter((x) => x !== id);
      }
      if (cur.length >= maxActive) {
        setMsg({ tone: 'error', text: `Max ${maxActive} aktiva personor — ta bort en först.` });
        return cur;
      }
      return [...cur, id];
    });
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await graphFetch(`/api/clients/${clientId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personas: active }),
      });
      setMsg({ tone: 'ok', text: 'Personor sparade. Nästa probe-körning mäter dem.' });
      setDirty(false);
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || !registry) {
    return (
      <UI.Card padding="20px" style={{ marginBottom: 16 }}>
        <SectionTitle />
        <p style={{ color: C.dim, fontSize: 13 }}>Laddar persona-palett…</p>
      </UI.Card>
    );
  }

  return (
    <UI.Card padding="20px" style={{ marginBottom: 16 }}>
      <SectionTitle />
      {msg && (
        <UI.StatusBanner
          tone={msg.tone === 'ok' ? 'ok' : 'err'}
          icon={msg.tone === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
          style={{ marginTop: 8, marginBottom: 12 }}
        >
          {msg.text}
        </UI.StatusBanner>
      )}
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.55 }}>
        Välj vilka målgrupper AI-motorerna mäts mot. Varje persona mäts på alla sex
        värmedimensioner — fler personor ger djupare bild men kostar mer mätning.{' '}
        <strong style={{ color: C.text }}>{active.length}/{maxActive}</strong> aktiva.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {registry.personas.map((p) => {
          const isActive = active.includes(p.id);
          const isExpanded = expanded === p.id;
          const disabled = !isActive && atCap;
          return (
            <div key={p.id} style={{ border: `1px solid ${isActive ? 'rgba(224, 142, 121,0.35)' : C.border}`, borderRadius: 8, overflow: 'hidden', background: isActive ? 'rgba(224, 142, 121,0.04)' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <button
                  onClick={() => toggle(p.id)}
                  disabled={disabled}
                  title={disabled ? `Max ${maxActive} aktiva` : (isActive ? 'Avaktivera' : 'Aktivera')}
                  style={{
                    width: 38, height: 22, borderRadius: 11, border: 'none', flexShrink: 0,
                    background: isActive ? C.accent : C.border,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1, position: 'relative', transition: 'background .15s',
                  }}
                >
                  <span style={{ position: 'absolute', top: 2, left: isActive ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.label_sv}</span>
                    {p.is_default && <span style={{ fontSize: 10, color: C.muted, background: C.border, borderRadius: 4, padding: '1px 6px' }}>standard</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{p.description_sv}</div>
                </div>
                <button
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                  title="Visa probe-frågor"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}
                >
                  Frågor {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              </div>
              {isExpanded && (
                <div style={{ borderTop: `1px dashed ${C.border}`, padding: '10px 12px', background: 'rgba(106,126,138,0.04)' }}>
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, fontStyle: 'italic' }}>
                    Frågorna mäter hur AI uppfattar er ur denna persons perspektiv. Read-only — justeras i registret.
                  </div>
                  {Object.entries(p.probe_templates).map(([dim, t]) => (
                    <div key={dim} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>{DIMENSION_LABELS[dim] || dim}</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>+ {t.neutral}</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>− {t.adversarial}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <UI.SaveButton dirty={dirty} saving={saving} onClick={save} label="Spara personor" savingLabel="Sparar…" />
      </div>
    </UI.Card>
  );
}

function SectionTitle() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Users size={16} color={C.accent} />
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text }}>Persona-palett</h3>
    </div>
  );
}
