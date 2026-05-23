import { ReactNode } from 'react';

// Light theme scoped to the geogiraph section only. The shared sidebar/header
// (used by The Insiders too) stay dark; this wrapper paints the content area
// behind the page cards with the off-white background and slate base text.
export default function InsiderGraphLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: '#f9fafb', color: '#3a4b56', minHeight: '100%' }}>
      {children}
    </div>
  );
}
