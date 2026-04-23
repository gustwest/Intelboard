/**
 * Kanban Issue API
 * GET  /api/admin/kanban — List all issues with creator + comment count + images
 * POST /api/admin/kanban — Create a new issue
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  // DB fallback for stale JWT
  let isAdmin = session?.user?.role === 'ADMIN';
  if (!isAdmin && session?.user?.id) {
    const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    isAdmin = u?.role === 'ADMIN';
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const issues = await prisma.kanbanIssue.findMany({
    orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
    include: {
      creator: { select: { id: true, name: true, image: true } },
      images: { select: { id: true, url: true }, orderBy: { order: 'asc' } },
      _count: { select: { comments: true, agentTasks: true } },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { author: { select: { name: true } } },
      },
      agentTasks: {
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });

  // Add latestComment info, then strip raw comments array
  const enriched = issues.map((issue) => {
    const latest = issue.comments[0] || null;
    const { comments, ...rest } = issue;
    return {
      ...rest,
      latestComment: latest
        ? {
            authorName: latest.author?.name || 'Unknown',
            createdAt: latest.createdAt.toISOString(),
            body: latest.body.substring(0, 80),
          }
        : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, description, images } = body as {
      title: string;
      description: string;
      images?: { url: string; caption?: string }[];
    };

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    // Get max order for NY column
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
        creatorId: session.user.id!,
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
        creator: { select: { id: true, name: true, image: true } },
        images: { select: { id: true, url: true }, orderBy: { order: 'asc' } },
        _count: { select: { comments: true } },
      },
    });

    // Push notification placeholder — not implemented in AIDAS yet

    return NextResponse.json(issue, { status: 201 });
  } catch (err) {
    console.error('[kanban] Create error:', err);
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 });
  }
}
