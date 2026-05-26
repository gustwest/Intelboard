/**
 * GET /api/admin/arkitektur/status
 * Pingar våra miljöer parallellt (staging-frontend, insiders-api, insider-graph-api)
 * och returnerar ett JSON-svar med svarstid + upp/ned per tjänst.
 *
 * Middleware släpper igenom /api, så roll-kollen görs här: bara ADMIN/SUPERADMIN.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ENVIRONMENTS } from '@/app/arkitektur/data';

export const dynamic = 'force-dynamic';

type Target = { name: string; url: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || ENVIRONMENTS.api;
const GRAPH_URL = process.env.NEXT_PUBLIC_GRAPH_API_URL || ENVIRONMENTS.graph;

const TARGETS: Target[] = [
  { name: 'Frontend (staging)', url: `${ENVIRONMENTS.frontend}/login` },
  { name: 'Insiders API', url: `${API_URL}/health` },
  { name: 'Insider Graph API', url: `${GRAPH_URL}/health` },
];

async function ping(t: Target) {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(t.url, { cache: 'no-store', signal: ctrl.signal, redirect: 'manual' });
    clearTimeout(timer);
    const ms = Date.now() - start;
    // Allt under 500 räknas som "tjänsten svarar" (inkl. 3xx/401 från auth/redirect).
    const ok = res.status < 500;
    return { name: t.name, url: t.url, ok, ms, detail: `HTTP ${res.status}` };
  } catch (e) {
    return {
      name: t.name,
      url: t.url,
      ok: false,
      ms: null,
      detail: e instanceof Error && e.name === 'AbortError' ? 'Timeout (>5s)' : 'Oåtkomlig',
    };
  }
}

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== 'ADMIN' && role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const services = await Promise.all(TARGETS.map(ping));
  return NextResponse.json({ checkedAt: new Date().toISOString(), services });
}
