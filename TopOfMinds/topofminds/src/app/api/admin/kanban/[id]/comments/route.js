/**
 * Kanban Comments API
 * GET  /api/admin/kanban/[id]/comments
 * POST /api/admin/kanban/[id]/comments
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req, { params }) {
  const { id } = await params;

  const comments = await prisma.kanbanComment.findMany({
    where: { issueId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      images: { orderBy: { order: 'asc' } },
    },
  });

  return NextResponse.json(comments);
}

export async function POST(req, { params }) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { body: commentBody, images } = body;

    if (!commentBody?.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
    }

    const issue = await prisma.kanbanIssue.findUnique({ where: { id } });
    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const comment = await prisma.kanbanComment.create({
      data: {
        issueId: id,
        authorName: 'Admin',
        body: commentBody.trim(),
        images: images?.length
          ? {
              create: images.map((img, i) => ({
                url: img.url,
                caption: img.caption || null,
                order: i,
              })),
            }
          : undefined,
      },
      include: {
        images: { orderBy: { order: 'asc' } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error('[kanban] Comment error:', err);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
