/**
 * Kanban Issue CRUD — single issue
 * GET    /api/admin/kanban/[id] — Get single issue with full details
 * PATCH  /api/admin/kanban/[id] — Update status, order, title, description
 * DELETE /api/admin/kanban/[id] — Delete issue
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const issue = await prisma.kanbanIssue.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      images: { orderBy: { order: 'asc' } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, image: true } },
          images: { orderBy: { order: 'asc' } },
        },
      },
      agentTasks: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          prompt: true,
          status: true,
          model: true,
          error: true,
          response: true,
          createdAt: true,
          updatedAt: true,
          logs: {
            orderBy: { createdAt: 'asc' },
            take: 50,
            select: { id: true, message: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!issue) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(issue);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { status, order, title, description, creatorId } = body as {
      status?: string;
      order?: number;
      title?: string;
      description?: string;
      creatorId?: string;
    };

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (order !== undefined) data.order = order;
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (creatorId !== undefined) data.creatorId = creatorId;

    const issue = await prisma.kanbanIssue.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, name: true, image: true } },
        images: { select: { id: true, url: true }, orderBy: { order: 'asc' } },
        _count: { select: { comments: true } },
      },
    });

      // Push notification placeholder — not implemented in AIDAS yet

    return NextResponse.json(issue);
  } catch (err) {
    console.error('[kanban] Update error:', err);
    return NextResponse.json({ error: 'Failed to update issue' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.kanbanIssue.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[kanban] Delete error:', err);
    return NextResponse.json({ error: 'Failed to delete issue' }, { status: 500 });
  }
}
