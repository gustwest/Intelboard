/**
 * Kanban Issue CRUD — single issue
 * GET    /api/admin/kanban/[id]
 * PATCH  /api/admin/kanban/[id]
 * DELETE /api/admin/kanban/[id]
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req, { params }) {
  const { id } = await params;

  const issue = await prisma.kanbanIssue.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: 'asc' } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
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

export async function PATCH(req, { params }) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { status, order, title, description } = body;

    const data = {};
    if (status !== undefined) data.status = status;
    if (order !== undefined) data.order = order;
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();

    const issue = await prisma.kanbanIssue.update({
      where: { id },
      data,
      include: {
        images: { select: { id: true, url: true }, orderBy: { order: 'asc' } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json(issue);
  } catch (err) {
    console.error('[kanban] Update error:', err);
    return NextResponse.json({ error: 'Failed to update issue' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params;

  try {
    await prisma.kanbanIssue.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[kanban] Delete error:', err);
    return NextResponse.json({ error: 'Failed to delete issue' }, { status: 500 });
  }
}
