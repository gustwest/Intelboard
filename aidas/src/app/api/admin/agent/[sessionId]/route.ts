import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH — rename and/or pin/unpin a session.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { sessionId } = await params;

  try {
    const body = (await req.json()) as { title?: string; pinned?: boolean };
    const data: { title?: string; pinned?: boolean } = {};

    if (typeof body.title === 'string') {
      const trimmed = body.title.trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      data.title = trimmed.slice(0, 120);
    }
    if (typeof body.pinned === 'boolean') {
      data.pinned = body.pinned;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.agentSession.update({
      where: { id: sessionId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Agent session update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE — remove a session (cascades to tasks + logs via schema).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { sessionId } = await params;

  try {
    await prisma.agentSession.delete({ where: { id: sessionId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Agent session delete error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
