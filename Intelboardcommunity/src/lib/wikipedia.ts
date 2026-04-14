export interface WikiSummary {
  title: string;
  extract: string;
  extract_html: string;
  description: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  content_urls?: {
    desktop: { page: string };
    mobile: { page: string };
  };
}

export async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'IntelboardCommunity/1.0 (contact@intelboard.com)',
        },
        next: { revalidate: 86400 }, // Cache for 24 hours
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Wikipedia API error:', error);
    return null;
  }
}

export async function fetchWikiContent(title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`,
      {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'IntelboardCommunity/1.0 (contact@intelboard.com)',
        },
        next: { revalidate: 86400 },
      }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch (error) {
    console.error('Wikipedia content error:', error);
    return null;
  }
}
