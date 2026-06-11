'use client';

import { graphColors as C } from '../../_components/GraphPageShell';
import { ExposureBand, PersonaExposure } from '../_shared';

/**
 * E1 (beslut B2): exponering som visuell bandskala + insiktsmening — aldrig den
 * obegränsade kvoten som siffra. Vid tunt/inget underlag gråtonas skalan och
 * insikten säger vad som krävs för att klassningen ska aktiveras.
 */
const BANDS: { id: ExposureBand; label: string; color: string }[] = [
  { id: 'low', label: 'Låg', color: '#16a34a' },
  { id: 'elevated', label: 'Förhöjd', color: '#d97706' },
  { id: 'high', label: 'Hög', color: '#ea580c' },
  { id: 'critical', label: 'Kritisk', color: '#b91c1c' },
];

export function ExposureScale({ exposure }: { exposure: PersonaExposure }) {
  const band = exposure.band;
  const classified = band === 'low' || band === 'elevated' || band === 'high' || band === 'critical';
  const sev = exposure.severities;

  return (
    <div>
      {/* Skalan: fyra zoner, aktiv zon i full färg. Ogradad (grå) när underlaget inte bär. */}
      <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
        {BANDS.map((b) => {
          const active = classified && b.id === band;
          return (
            <div key={b.id} style={{ flex: 1 }}>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: classified ? b.color : C.border,
                  opacity: classified ? (active ? 1 : 0.18) : 0.5,
                  transition: 'opacity 0.2s',
                }}
              />
              <div
                style={{
                  fontSize: 9,
                  fontWeight: active ? 700 : 500,
                  color: active ? b.color : C.dim,
                  textAlign: 'center',
                  marginTop: 3,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {b.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Klassningen i ord + allvarlighets-chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: classified ? (BANDS.find((b) => b.id === band)?.color || C.text) : C.muted }}>
          {exposure.band_label || '—'}
        </span>
        {classified && sev && (sev.high > 0 || sev.medium > 0 || sev.low > 0) && (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {sev.high > 0 && <SevChip label={`${sev.high} hög`} color="#b91c1c" />}
            {sev.medium > 0 && <SevChip label={`${sev.medium} medel`} color="#d97706" />}
            {sev.low > 0 && <SevChip label={`${sev.low} låg`} color="#6a7e8a" />}
          </span>
        )}
      </div>

      {exposure.insight && (
        <p style={{ fontSize: 12, color: C.text, margin: '8px 0 0', lineHeight: 1.55 }}>
          {exposure.insight}
        </p>
      )}
    </div>
  );
}

function SevChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}14`, border: `1px solid ${color}33`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}
