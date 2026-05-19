export const GRAPH_API =
  process.env.NEXT_PUBLIC_GRAPH_API_URL || 'https://insider-graph-api-815335042776.europe-north1.run.app';

export async function graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH_API}${path}`, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}
