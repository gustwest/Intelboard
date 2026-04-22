/**
 * Agent API
 * GET  /api/admin/agent — List sessions with tasks
 * POST /api/admin/agent — Create session + task
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req) {
  try {
    const { prompt, sessionId, model, kanbanIssueId } = await req.json();

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
          createdBy: 'admin',
        },
      });
    }

    const task = await prisma.agentTask.create({
      data: {
        prompt: trimmed,
        createdBy: 'admin',
        status: 'PENDING',
        model: model || null,
        sessionId: agentSession.id,
        kanbanIssueId: kanbanIssueId || null,
      },
    });

    // Auto-move kanban issue to "Pågår utveckling" if linked
    if (kanbanIssueId) {
      await prisma.kanbanIssue.update({
        where: { id: kanbanIssueId },
        data: { status: 'PAGAR_UTVECKLING' },
      }).catch(() => {});

      await prisma.kanbanComment.create({
        data: {
          issueId: kanbanIssueId,
          authorName: '🤖 Agent',
          body: `Agent-uppgift startad${model ? ` (${model})` : ''}\n\nPrompt: ${trimmed.slice(0, 200)}${trimmed.length > 200 ? '...' : ''}`,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ task, session: agentSession }, { status: 201 });
  } catch (error) {
    console.error('Agent submit error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const sessions = await prisma.agentSession.findMany({
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
      include: {
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

// PATCH — Manual task controls: stop a running task or retry a failed one.
//   body: { taskId, action: 'stop' | 'retry' }
export async function PATCH(req) {
  try {
    const { taskId, action } = await req.json();

    if (!taskId || !action) {
      return NextResponse.json({ error: 'taskId and action required' }, { status: 400 });
    }

    const task = await prisma.agentTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (action === 'stop') {
      if (task.status !== 'RUNNING' && task.status !== 'PENDING') {
        return NextResponse.json({ error: 'Task is not running/pending' }, { status: 400 });
      }
      await prisma.agentTask.update({
        where: { id: taskId },
        data: { status: 'STOPPED', error: 'Stoppad manuellt av admin' },
      });
      await prisma.agentTaskLog.create({
        data: { taskId, message: '⏹️ Uppgiften stoppades manuellt av admin' },
      });
      return NextResponse.json({ ok: true, status: 'STOPPED' });
    }

    if (action === 'retry') {
      if (task.status !== 'FAILED' && task.status !== 'STOPPED') {
        return NextResponse.json({ error: 'Task is not failed/stopped' }, { status: 400 });
      }
      await prisma.agentTask.update({
        where: { id: taskId },
        data: { status: 'PENDING', error: null },
      });
      await prisma.agentTaskLog.create({
        data: { taskId, message: '🔄 Manuell omstart av admin' },
      });
      return NextResponse.json({ ok: true, status: 'PENDING' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Agent PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
