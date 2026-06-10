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
  let res: Response;
  try {
    res = await fetch(`${targetUrl(path)}`, { ...init, headers });
  } catch {
    // KU8: nätverks-/anslutningsfel → vänlig text i st f rått TypeError ("Failed to fetch").
    throw new Error('Kunde inte nå servern — kontrollera anslutningen och försök igen.');
  }
  if (!res.ok) {
    throw new Error(friendlyHttpError(res.status, await res.text().catch(() => '')));
  }
  return res.json();
}

// KU8: råa "HTTP 500: <body>"-fel → vänlig svensk copy. FastAPI:s {"detail":"…"} plockas ut
// (ofta redan en läsbar mening, t.ex. "ogiltig contact_email"); annars en generisk text per
// statusklass. Det exakta felet loggas i webbläsarkonsolen (rått kvar där för felsökning).
function friendlyHttpError(status: number, body: string): string {
  let detail = '';
  try {
    const j = JSON.parse(body);
    if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
  } catch {
    /* body ej JSON */
  }
  if (status >= 400) console.warn(`graphFetch ${status}:`, detail || body.slice(0, 300));
  if (status === 404) return detail || 'Det här hittades inte.';
  if (status === 401 || status === 403) return 'Du saknar behörighet — logga in igen.';
  if (status === 429) return 'För många anrop just nu — vänta en stund och försök igen.';
  if (status >= 500) return 'Något gick fel på servern. Försök igen om en stund.';
  // 4xx (400/409 m.fl.): FastAPI-detail är oftast en läsbar valideringsmening.
  return detail || `Något gick fel (kod ${status}).`;
}

/** Hämtar binärt innehåll (t.ex. uppladdat verifieringsunderlag) via proxyn. */
export async function graphFetchBlob(path: string): Promise<Blob> {
  const headers = applyServerKey(new Headers());
  let res: Response;
  try {
    res = await fetch(`${targetUrl(path)}`, { headers });
  } catch {
    throw new Error('Kunde inte nå servern — kontrollera anslutningen.');
  }
  if (!res.ok) throw new Error(friendlyHttpError(res.status, await res.text().catch(() => '')));
  return res.blob();
}

/** Absolut, login-gate:ad URL för delningslänkar (rapport-HTML). Går via proxyn → den
 *  interna rapporten kräver inloggat team-konto även när länken öppnas direkt. */
export function proxyShareUrl(path: string): string {
  const origin = isServer ? '' : window.location.origin;
  return `${origin}${PROXY_BASE}${path}`;
}
