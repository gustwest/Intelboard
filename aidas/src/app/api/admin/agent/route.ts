import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST — Admin sends a message.
//   - If `sessionId` is omitted: creates a NEW AgentSession + AgentTask (first message).
//   - If `sessionId` is provided: appends a new AgentTask (follow-up message) to that session.
//   - If `kanbanIssueId` is provided: links the task to a kanban issue and auto-moves it.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { prompt, sessionId, model, kanbanIssueId } = (await req.json()) as {
      prompt?: string;
      sessionId?: string;
      model?: string;
      kanbanIssueId?: string;
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const trimmed = prompt.trim();
    let agentSession;

    if (sessionId) {
      agentSession = await prisma.agentSession.findUnique({
        where: { id: sessionId },
      });
      if (!agentSession) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      await prisma.agentSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
    } else {
      agentSession = await prisma.agentSession.create({
        data: {
          title: trimmed.slice(0, 80),
          createdBy: session.user.id,
        },
      });
    }

    const task = await prisma.agentTask.create({
      data: {
        prompt: trimmed,
        createdBy: session.user.id,
        status: 'PENDING',
        model: model || null,
        sessionId: agentSession.id,
        kanbanIssueId: kanbanIssueId || null,
      },
      include: {
        creator: { select: { name: true } },
      },
    });

    // Auto-move kanban issue to "Pågår utveckling" if linked
    if (kanbanIssueId) {
      await prisma.kanbanIssue.update({
        where: { id: kanbanIssueId },
        data: { status: 'PAGAR_UTVECKLING' },
      }).catch(() => {}); // Silent fail if issue doesn't exist

      // Add a comment to the kanban issue
      await prisma.kanbanComment.create({
        data: {
          issueId: kanbanIssueId,
          authorId: session.user.id,
          body: `🤖 Agent-uppgift startad${model ? ` (${model})` : ''}\n\nPrompt: ${trimmed.slice(0, 200)}${trimmed.length > 200 ? '...' : ''}`,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ task, session: agentSession }, { status: 201 });
  } catch (error) {
    console.error('Agent submit error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// GET — Sessions with nested tasks (most recent 50 sessions).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const sessions = await prisma.agentSession.findMany({
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
      include: {
        creator: { select: { name: true } },
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { logs: true } },
          },
        },
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Agent list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

