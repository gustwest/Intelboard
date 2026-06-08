/**
 * Server-side proxy: webbläsare → HÄR (NextAuth-session + team-allowlist) → insider-graph-api.
 *
 * Backend kräver X-API-Key. Nyckeln lever BARA server-side (`GRAPH_API_KEY`, runtime-env
 * ur Secret Manager) och når aldrig webbläsaren. Middlewaren släpper `/api` förbi auth,
 * så sessionskollen görs HÄR — bara team-allowlist (lib/team) släpps igenom.
 *
 * Speglar metod, query, body och svar (JSON, blobbar, HTML-rapport) transparent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ALLOWED_EMAILS } from '@/lib/team';

export const dynamic = 'force-dynamic';

const GRAPH_BASE =
  process.env.GRAPH_API_URL ||
  process.env.NEXT_PUBLIC_GRAPH_API_URL ||
  'https://insider-graph-api-815335042776.europe-north1.run.app';

// Headers vi INTE vidarebefordrar (hop-by-hop + sätts av oss/fetch själv).
const STRIP = new Set(['host', 'connection', 'content-length', 'x-api-key', 'cookie']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !(email in ALLOWED_EMAILS)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { path } = await ctx.params;
  const target = `${GRAPH_BASE}/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!STRIP.has(k.toLowerCase())) headers.set(k, v); });
  const key = process.env.GRAPH_API_KEY;
  if (key) headers.set('x-api-key', key);

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const res = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });

  // Spegla svaret — bevara content-type/-disposition (JSON, blob, HTML-rapport).
  const respHeaders = new Headers();
  for (const h of ['content-type', 'content-disposition', 'cache-control']) {
    const v = res.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  return new NextResponse(res.body, { status: res.status, headers: respHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
