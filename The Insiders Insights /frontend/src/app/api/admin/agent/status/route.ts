/**
 * GET /api/admin/agent/status — Agent online status + stats
 */
import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/agent-store';

export async function GET() {
  const status = await getStatus();
  return NextResponse.json(status);
}
