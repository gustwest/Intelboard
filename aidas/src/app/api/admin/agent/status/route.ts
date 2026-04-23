import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Heartbeat session ID used by poll/route.ts to persist last poll time
const HEARTBEAT_SESSION_NAME = '__agent_heartbeat__';

// Also check globalThis for same-instance fast path
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

export function recordAgentPoll(meta?: Partial<AgentHeartbeat>) {
  g.__agentHeartbeat!.lastPoll = new Date().toISOString();
  if (meta) {
    Object.assign(g.__agentHeartbeat!, meta);
  }
}

// GET — Check if the local agent is online + stats
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Check heartbeat from globalThis (same instance) and DB (cross-instance)
  const heartbeat = g.__agentHeartbeat!;
  let lastPoll = heartbeat.lastPoll;
  let model = heartbeat.model;

  // If globalThis has no heartbeat, check DB
  if (!lastPoll) {
    try {
      const hbSession = await prisma.agentSession.findUnique({
        where: { id: HEARTBEAT_SESSION_NAME },
        select: { updatedAt: true, claudeSessionId: true },
      });
      if (hbSession) {
        lastPoll = hbSession.updatedAt.toISOString();
        model = hbSession.claudeSessionId || model;
      }
    } catch {
      // Table might not have the heartbeat row yet
    }
  }

  // Check if there's a RUNNING task (agent must be active)
  const runningTask = await prisma.agentTask.findFirst({
    where: { status: 'RUNNING' },
  });

  // Agent is online if it polled within the last 30 seconds OR has a running task
  const isOnline =
    runningTask !== null ||
    (lastPoll !== null && Date.now() - new Date(lastPoll).getTime() < 30_000);

  // Get task stats
  const [totalTasks, completedTasks, failedTasks] = await Promise.all([
    prisma.agentTask.count(),
    prisma.agentTask.count({ where: { status: 'DONE' } }),
    prisma.agentTask.count({ where: { status: 'FAILED' } }),
  ]);

  // Get last completed task time
  const lastCompleted = await prisma.agentTask.findFirst({
    where: { status: 'DONE' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, prompt: true },
  });

  return NextResponse.json({
    online: isOnline,
    lastPoll: lastPoll || null,
    runningTaskId: runningTask?.id || null,
    model: model || 'claude-sonnet-4-6',
    cliVersion: heartbeat.cliVersion || null,
    projectDir: heartbeat.projectDir || null,
    stats: {
      total: totalTasks,
      completed: completedTasks,
      failed: failedTasks,
      successRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    },
    lastCompleted: lastCompleted ? {
      time: lastCompleted.createdAt.toISOString(),
      prompt: lastCompleted.prompt.substring(0, 60),
    } : null,
  });
}
