/**
 * GET /api/admin/agent/status — Agent online status + stats
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStatus } from '@/lib/agent-store';

export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get('product') || undefined;
  const status = await getStatus(product);
  return NextResponse.json(status);
}
