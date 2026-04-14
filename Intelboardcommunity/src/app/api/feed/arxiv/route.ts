/**
 * /api/feed/arxiv — proxy for arXiv API to avoid CORS issues
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || 'cs.AI';
  const maxResults = searchParams.get('max') || '5';

  try {
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Intelboard/1.0' },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `arXiv returned ${res.status}` }, { status: res.status });
    }

    const text = await res.text();
    return new NextResponse(text, {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
