/**
 * Kanban Issue API
 * GET  /api/admin/kanban — List all issues
 * POST /api/admin/kanban — Create a new issue
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  const issues = await prisma.kanbanIssue.findMany({
    orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
    include: {
      images: { select: { id: true, url: true }, orderBy: { order: 'asc' } },
      _count: { select: { comments: true, agentTasks: true } },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      agentTasks: {
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });

  const enriched = issues.map((issue) => {
    const latest = issue.comments[0] || null;
    const { comments, ...rest } = issue;
    return {
      ...rest,
      latestComment: latest
        ? {
            authorName: latest.authorName || 'Admin',
            createdAt: latest.createdAt.toISOString(),
            body: latest.body.substring(0, 80),
          }
        : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { title, description, images } = body;

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const maxOrder = await prisma.kanbanIssue.findFirst({
      where: { status: 'NY' },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const issue = await prisma.kanbanIssue.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        status: 'NY',
        order: (maxOrder?.order ?? -1) + 1,
        creatorName: 'Admin',
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
        images: { select: { id: true, url: true }, orderBy: { order: 'asc' } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({ ...issue, latestComment: null, agentTasks: [] }, { status: 201 });
  } catch (err) {
    console.error('[kanban] Create error:', err);
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 });
  }
}
