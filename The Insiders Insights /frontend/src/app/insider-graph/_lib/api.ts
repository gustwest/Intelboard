export const GRAPH_API =
  process.env.NEXT_PUBLIC_GRAPH_API_URL || 'https://insider-graph-api-815335042776.europe-north1.run.app';

const GRAPH_API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY || '';

export async function graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (GRAPH_API_KEY && !headers.has('x-api-key')) {
    headers.set('x-api-key', GRAPH_API_KEY);
  }
  const res = await fetch(`${GRAPH_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/** Hämtar binärt innehåll (t.ex. uppladdat verifieringsunderlag) med API-nyckeln. */
export async function graphFetchBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  if (GRAPH_API_KEY) headers.set('x-api-key', GRAPH_API_KEY);
  const res = await fetch(`${GRAPH_API}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}
