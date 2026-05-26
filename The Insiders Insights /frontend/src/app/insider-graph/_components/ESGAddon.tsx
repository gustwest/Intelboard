'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Leaf, ArrowRight } from 'lucide-react';
import { graphColors as C } from './GraphPageShell';
import { graphFetch } from '../_lib/api';

/**
 * AI-synlighet — ESG & CSRD Perception Audit: valbart tillägg per kund.
 * Slås på/av när som helst (PUT /api/esg/{id}/config). När påslaget exponeras
 * ESG-åtgärderna (generera frågebatteri → kör blind skanning → bygg rapport).
 * Frågorna passerar en review-grind innan de körs skarpt.
 */
export default function ESGAddon({ clientId }: { clientId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await graphFetch<{ esg_audit_enabled: boolean }>(`/api/esg/${clientId}/config`);
      setEnabled(data.esg_audit_enabled);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setBanner(null);
    try {
      await graphFetch(`/api/esg/${clientId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esg_audit_enabled: next }),
      });
      setEnabled(next);
      setBanner({ tone: 'ok', text: next ? 'ESG-tillägget påslaget' : 'ESG-tillägget avstängt' });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Leaf size={16} color="#16a34a" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3a4b56' }}>ESG &amp; CSRD Perception Audit</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              AI-synlighet — valbart tillägg. Blind nollmätning av bolagets hållbarhetsrykte i AI-motorer.
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={enabled === null || saving}
          style={{
            padding: '5px 12px',
            borderRadius: 999,
            background: enabled ? 'rgba(34,197,94,0.18)' : 'transparent',
            color: enabled ? '#16a34a' : C.muted,
            border: `1px solid ${enabled ? 'rgba(34,197,94,0.4)' : C.border}`,
            fontSize: 11,
            fontWeight: 600,
            cursor: enabled === null || saving ? 'wait' : 'pointer',
            flexShrink: 0,
          }}
        >
          {enabled === null ? '…' : saving ? 'Sparar…' : enabled ? 'På' : 'Av'}
        </button>
      </div>

      {banner && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 8,
            background: banner.tone === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: banner.tone === 'ok' ? '#16a34a' : '#ef4444',
            border: `1px solid ${banner.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {banner.text}
        </div>
      )}

      {enabled && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Hantera frågegranskning, blind skanning, findings och AI ESG Risk Score i arbetsytan.
          </div>
          <Link
            href={`/insider-graph/esg/${clientId}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(159,81,182,0.12)', color: C.accent, border: '1px solid rgba(159,81,182,0.4)', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
          >
            Öppna ESG-arbetsytan <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
