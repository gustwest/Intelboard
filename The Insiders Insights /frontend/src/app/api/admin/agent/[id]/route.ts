/**
 * GET    /api/admin/agent/[id] — Get session detail
 * PATCH  /api/admin/agent/[id] — Update session (rename, pin)
 * DELETE /api/admin/agent/[id] — Delete session
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, patchSession, deleteSession } from '@/lib/agent-store';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const session = await patchSession(id, {
    title: body.title,
    pinned: body.pinned,
  });
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteSession(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
