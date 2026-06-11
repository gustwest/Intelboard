'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { graphColors as C } from '../../_components/GraphPageShell';
import MeasurementConfigEditor from '../../_components/MeasurementConfigEditor';
import PersonaPaletteEditor from '../../_components/PersonaPaletteEditor';

export type SettingsTab = 'questions' | 'personas';

/**
 * L4 (UX-audit p.2/p.17): mätinställningarna bor där arbetet sker. Samma
 * editorer som på kundkortet (som behåller sin ingång för onboarding), men
 * som slide-over direkt i AI-synlighetsfliken — inget kontextbyte för att
 * justera frågor, substitutioner eller persona-palett.
 */
export function SettingsDrawer({ clientId, initialTab, onClose }: {
  clientId: string;
  initialTab: SettingsTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 90, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 94vw)', height: '100%', background: '#f8f9fa',
          boxShadow: '-16px 0 48px rgba(58,75,86,0.18)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: '#fff' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Mätinställningar</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Ändringar slår igenom vid nästa mätkörning. Samma inställningar nås från kundkortet.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', background: 'rgba(106,126,138,0.08)', borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
            {([['questions', 'Synlighets-frågor & kontext'], ['personas', 'Persona-palett']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 600,
                  background: tab === id ? '#ffffff' : 'transparent',
                  color: tab === id ? C.text : C.muted,
                  border: 'none', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em',
                  boxShadow: tab === id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            title="Stäng (Esc)"
            style={{ display: 'inline-flex', alignItems: 'center', padding: 8, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {tab === 'questions' ? (
            <MeasurementConfigEditor clientId={clientId} />
          ) : (
            <PersonaPaletteEditor clientId={clientId} />
          )}
        </div>
      </div>
    </div>
  );
}
