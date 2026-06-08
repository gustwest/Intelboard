// Absolut backend-URL. Används av SERVER-side anropare (t.ex. arkitektur/data.ts) och
// för ev. visningssyfte. Webbläsaren går ALDRIG hit direkt längre — den går via den
// login-gate:ade server-proxyn (/api/graph), så API-nyckeln aldrig hamnar i klienten.
export const GRAPH_API =
  process.env.NEXT_PUBLIC_GRAPH_API_URL || 'https://insider-graph-api-815335042776.europe-north1.run.app';

// Same-origin server-proxy (src/app/api/graph/[...path]) — session-kollad, lägger på nyckeln.
const PROXY_BASE = '/api/graph';

const isServer = typeof window === 'undefined';

function targetUrl(path: string): string {
  // Server: direkt mot backend (med server-only nyckel). Klient: via proxyn.
  return isServer ? `${GRAPH_API}${path}` : `${PROXY_BASE}${path}`;
}

function applyServerKey(headers: Headers): Headers {
  if (isServer && process.env.GRAPH_API_KEY) headers.set('x-api-key', process.env.GRAPH_API_KEY);
  return headers;
}

export async function graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = applyServerKey(new Headers(init?.headers));
  const res = await fetch(`${targetUrl(path)}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/** Hämtar binärt innehåll (t.ex. uppladdat verifieringsunderlag) via proxyn. */
export async function graphFetchBlob(path: string): Promise<Blob> {
  const headers = applyServerKey(new Headers());
  const res = await fetch(`${targetUrl(path)}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** Absolut, login-gate:ad URL för delningslänkar (rapport-HTML). Går via proxyn → den
 *  interna rapporten kräver inloggat team-konto även när länken öppnas direkt. */
export function proxyShareUrl(path: string): string {
  const origin = isServer ? '' : window.location.origin;
  return `${origin}${PROXY_BASE}${path}`;
}
