import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Use globalThis heartbeat — shared with status/route.ts within same Node.js process
interface AgentHeartbeat {
  lastPoll: string | null;
  model?: string;
  cliVersion?: string;
  projectDir?: string;
}
const g = globalThis as typeof globalThis & { __agentHeartbeat?: AgentHeartbeat };
if (!g.__agentHeartbeat) {
  g.__agentHeartbeat = { lastPoll: null };
}
function recordAgentPoll(meta?: Partial<AgentHeartbeat>) {
  g.__agentHeartbeat!.lastPoll = new Date().toISOString();
  if (meta) {
    Object.assign(g.__agentHeartbeat!, meta);
  }
}

// Simple API key auth for the local agent
function authenticateAgent(req: NextRequest): boolean {
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) return false;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;

  return authHeader === `Bearer ${apiKey}`;
}

// GET — Local agent polls for the next task to execute.
//   Priority: 1) FAILED tasks eligible for retry  2) PENDING tasks
const MAX_RETRIES = 2;
const RETRY_WINDOW_MS = 30 * 60 * 1000;
const RETRY_LOG_MARKER = '🔁 Auto-retry';
const STALE_ACTIVITY_MS = 10 * 60 * 1000; // 10 min without logs = hung

export async function GET(req: NextRequest) {
  if (!authenticateAgent(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    recordAgentPoll({
      model: req.headers.get('x-agent-model') || undefined,
      cliVersion: req.headers.get('x-agent-version') || undefined,
      projectDir: req.headers.get('x-agent-project') || undefined,
    });

    // ── 0) Detect hung RUNNING tasks (no log activity for 10 min) ──
    const runningTasks = await prisma.agentTask.findMany({
      where: { status: 'RUNNING' },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const staleThreshold = new Date(Date.now() - STALE_ACTIVITY_MS);
    for (const rt of runningTasks) {
      const lastActivity = rt.logs[0]?.createdAt || rt.updatedAt;
      if (lastActivity < staleThreshold) {
        console.log(`⚠️ Stale task detected: ${rt.id} — no activity since ${lastActivity.toISOString()}`);
        await prisma.agentTask.update({
          where: { id: rt.id },
          data: { status: 'FAILED', error: 'Uppgiften hängde sig (ingen aktivitet på 10 min)' },
        });
        await prisma.agentTaskLog.create({
          data: {
            taskId: rt.id,
            message: '⛔ Agent-processen detekterades som hängd (10 min utan aktivitet) — markeras som FAILED för omstart',
          },
        });
      }
    }

    // ── 1) Check for FAILED tasks eligible for retry ──
    const retryWindow = new Date(Date.now() - RETRY_WINDOW_MS);
    const failedTasks = await prisma.agentTask.findMany({
      where: {
        status: 'FAILED',
        updatedAt: { gte: retryWindow },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        session: { select: { id: true, claudeSessionId: true } },
        _count: { select: { logs: true } },
        logs: {
          where: { message: { startsWith: RETRY_LOG_MARKER } },
          select: { id: true },
        },
      },
    });

    let retryTask = null;
    for (const ft of failedTasks) {
      if (ft.logs.length < MAX_RETRIES) {
        retryTask = ft;
        break;
      }
    }

    if (retryTask) {
      const retryNum = retryTask.logs.length + 1;
      await prisma.agentTask.update({
        where: { id: retryTask.id },
        data: { status: 'PENDING', error: null },
      });
      await prisma.agentTaskLog.create({
        data: {
          taskId: retryTask.id,
          message: `${RETRY_LOG_MARKER} #${retryNum} — föregående körning kraschade/hängde sig`,
        },
      });

      return NextResponse.json(
        {
          task: {
            id: retryTask.id,
            prompt: retryTask.prompt,
            status: 'PENDING',
            model: retryTask.model || null,
            sessionId: retryTask.sessionId,
            resumeSessionId: retryTask.session?.claudeSessionId || null,
          },
          retry: retryNum,
          timestamp: new Date().toISOString(),
        },
        { headers: { 'X-Agent-Poll': new Date().toISOString() } }
      );
    }

    // ── 2) Normal: pick up the oldest PENDING task ──
    const task = await prisma.agentTask.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        session: { select: { id: true, claudeSessionId: true } },
      },
    });

    return NextResponse.json(
      {
        task: task
          ? {
              id: task.id,
              prompt: task.prompt,
              status: task.status,
              model: task.model || null,
              sessionId: task.sessionId,
              resumeSessionId: task.session?.claudeSessionId || null,
            }
          : null,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'X-Agent-Poll': new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    console.error('Agent poll error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH — Local agent updates task status, posts logs, and reports the
// Claude Code session_id for session resumption.
export async function PATCH(req: NextRequest) {
  if (!authenticateAgent(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { taskId, status, error, logs, claudeSessionId, response } = body as {
      taskId?: string;
      status?: string;
      error?: string;
      logs?: string[];
      claudeSessionId?: string;
      response?: string;
    };

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // Record heartbeat on result too
    recordAgentPoll();

    // Update task
    if (status || response !== undefined) {
      const updatedTask = await prisma.agentTask.update({
        where: { id: taskId },
        data: {
          ...(status ? { status: status as 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'STOPPED' } : {}),
          ...(error ? { error } : {}),
          ...(response !== undefined ? { response } : {}),
        },
        select: { kanbanIssueId: true, createdBy: true, prompt: true, sessionId: true },
      });

      // Auto-update kanban issue when task finishes
      if (updatedTask.kanbanIssueId && (status === 'DONE' || status === 'FAILED')) {
        const newKanbanStatus = status === 'DONE' ? 'REDO_FOR_VERIFIERING' : 'PRIORITERAD';
        await prisma.kanbanIssue.update({
          where: { id: updatedTask.kanbanIssueId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { status: newKanbanStatus as any },
        }).catch(() => {});

        // Add summary comment to kanban issue
        const taskLogs = await prisma.agentTaskLog.findMany({
          where: { taskId },
          orderBy: { createdAt: 'asc' },
          take: 20,
        });
        const logSummary = taskLogs.map(l => l.message).join('\n');
        const commentBody = status === 'DONE'
          ? `✅ Agent-uppgift klar!\n\n${response ? response.slice(0, 500) : ''}\n\n📋 Logg:\n${logSummary.slice(0, 1000)}`
          : `❌ Agent-uppgift misslyckades\n\n${error || 'Okänt fel'}\n\n📋 Logg:\n${logSummary.slice(0, 1000)}`;

        await prisma.kanbanComment.create({
          data: {
            issueId: updatedTask.kanbanIssueId,
            authorId: updatedTask.createdBy,
            body: commentBody,
          },
        }).catch(() => {});
      }
    }

    // Persist Claude session ID
    if (claudeSessionId) {
      const task = await prisma.agentTask.findUnique({
        where: { id: taskId },
        select: { sessionId: true },
      });
      if (task?.sessionId) {
        await prisma.agentSession.update({
          where: { id: task.sessionId },
          data: { claudeSessionId },
        });
      }
    }

    // Insert log entries
    if (logs && Array.isArray(logs) && logs.length > 0) {
      await prisma.agentTaskLog.createMany({
        data: logs.map((msg: string) => ({
          taskId,
          message: msg,
        })),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Agent update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
