'use client';

import { Users, Upload, Plus } from 'lucide-react';
import GraphPageShell, { graphColors as C } from '../_components/GraphPageShell';

export default function GraphKunderPage() {
  return (
    <GraphPageShell
      title="Kunder"
      icon={<Users size={22} />}
      subtitle="Insider Graph-kunder är samma bolag som i The Insiders. Här onboardas medarbetare och datakällor."
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Onboarda ny kund</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Välj en befintlig Insiders-kund och ladda upp CSV med namn + LinkedIn-URL. Discovery-agenten tar därefter över.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'rgba(124,109,250,0.18)',
              color: '#7c6dfa',
              border: '1px solid rgba(124,109,250,0.3)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            <Upload size={14} /> Importera CSV
          </button>
          <button
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'transparent',
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            <Plus size={14} /> Manuellt
          </button>
        </div>
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '48px 24px',
          textAlign: 'center',
        }}
      >
        <Users size={32} color={C.dim} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>Inga Graph-kunder ännu</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
          När Discovery-agenten är aktiverad i backend dyker onboardade kunder upp här med antal medarbetare,
          nodtyps-fördelning och kompileringsstatus.
        </div>
      </div>
    </GraphPageShell>
  );
}
