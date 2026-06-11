'use client';
import { useEffect } from 'react';

// Skyddar mot tyst förlust av osparade ändringar medan `dirty` är sant. Två lager:
//  1) beforeunload — flikstängning, omladdning, navigering till extern URL.
//  2) klick-interception (capture-fas) på interna länkar (<a>) — Next.js App Router
//     har ingen inbyggd route-abort, så vi fångar länkklick och bekräftar INNAN
//     navigeringen sker. Capture + stopPropagation hinner före Link-hanteraren.
//
// Känd lucka: webbläsarens bakåt/framåt-knapp (popstate sker efter navigeringen).
// beforeunload täcker hård navigering och länkar är den dominerande in-app-vägen,
// så detta fångar i praktiken alla vanliga sätt att tappa ändringar.
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const onClick = (e: MouseEvent) => {
      // Bara rena vänsterklick — modifierade klick öppnar i ny flik/fönster.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Extern URL hanteras av beforeunload; samma sida är ingen navigering.
      if (dest.origin !== window.location.origin) return;
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;

      if (!window.confirm('Du har osparade ändringar som går förlorade om du lämnar sidan. Vill du fortsätta?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
