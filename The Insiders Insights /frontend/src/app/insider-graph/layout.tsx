import { ReactNode } from 'react';

// Light theme scoped to the geogiraph section only. The shared sidebar/header
// (used by The Insiders too) stay dark; this wrapper paints the content area
// behind the page cards with the cream background, navy base text and the
// system-stack font (theinsiders.se-alignment) — The Insiders behåller Inter Tight.
export default function InsiderGraphLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: '#f4f3ef', color: '#333649', minHeight: '100%', fontFamily: 'var(--gg-font-sans)' }}>
      {children}
    </div>
  );
}
