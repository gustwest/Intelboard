/**
 * Agent Session CRUD
 * PATCH  /api/admin/agent/[sessionId] — Update title/pinned
 * DELETE /api/admin/agent/[sessionId] — Delete session
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(req, { params }) {
  const { sessionId } = await params;

  try {
    const body = await req.json();
    const data = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.pinned !== undefined) data.pinned = body.pinned;

    const session = await prisma.agentSession.update({
      where: { id: sessionId },
      data,
    });

    return NextResponse.json(session);
  } catch (err) {
    console.error('Session update error:', err);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const { sessionId } = await params;

  try {
    await prisma.agentSession.delete({ where: { id: sessionId } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('Session delete error:', err);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
