/**
 * Agent Poll Endpoint
 * GET  /api/admin/agent/poll — External poller checks for pending tasks
 * POST /api/admin/agent/poll — Poller submits result for a task
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// In-memory heartbeat — tracks when the poller last contacted us
globalThis.__agentHeartbeat = globalThis.__agentHeartbeat || { lastPoll: null, model: null, projectDir: null };

const MAX_RETRIES = 2;
const RETRY_WINDOW_MS = 30 * 60 * 1000;
const RETRY_LOG_MARKER = '🔁 Auto-retry';
const STALE_ACTIVITY_MS = 10 * 60 * 1000; // 10 min without logs = hung

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  // Simple secret-based auth for the poller
  if (process.env.AGENT_POLL_SECRET && secret !== process.env.AGENT_POLL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Record heartbeat — even if no tasks are pending
  globalThis.__agentHeartbeat.lastPoll = new Date().toISOString();
  globalThis.__agentHeartbeat.model = searchParams.get('model') || globalThis.__agentHeartbeat.model;
  globalThis.__agentHeartbeat.projectDir = searchParams.get('projectDir') || globalThis.__agentHeartbeat.projectDir;

  // ── 0) Detect completed-but-stuck + hung RUNNING tasks ──
  const runningTasks = await prisma.agentTask.findMany({
    where: { status: 'RUNNING' },
    include: {
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { createdAt: true, message: true },
      },
    },
  });

  const staleThreshold = new Date(Date.now() - STALE_ACTIVITY_MS);
  for (const rt of runningTasks) {
    const doneLog = rt.logs.find(l =>
      l.message.startsWith('✅ Done') || l.message.startsWith('✅ Agent completed') || l.message.startsWith('✅ Task completed')
    );
    if (doneLog) {
      await prisma.agentTask.update({
        where: { id: rt.id },
        data: { status: 'DONE' },
      });
      await prisma.agentTaskLog.create({
        data: {
          taskId: rt.id,
          message: '🔄 Automatiskt markerad som DONE — agenten rapporterade klart men processen avslutades inte',
        },
      });
      continue;
    }

    const lastActivity = rt.logs[0]?.createdAt || rt.updatedAt;
    if (lastActivity < staleThreshold) {
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
      session: { select: { claudeSessionId: true } },
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
      data: { status: 'RUNNING', error: null },
    });
    await prisma.agentTaskLog.create({
      data: {
        taskId: retryTask.id,
        message: `${RETRY_LOG_MARKER} #${retryNum} — föregående körning kraschade/hängde sig`,
      },
    });
    return NextResponse.json({ task: retryTask, retry: retryNum });
  }

  // ── 2) Normal: pick up the oldest PENDING task ──
  const task = await prisma.agentTask.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: {
      session: { select: { claudeSessionId: true } },
    },
  });

  if (!task) {
    return NextResponse.json({ task: null });
  }

  // Mark as RUNNING
  await prisma.agentTask.update({
    where: { id: task.id },
    data: { status: 'RUNNING' },
  });

  return NextResponse.json({ task });
}

export async function POST(req) {
  try {
    const { taskId, status, response, error, claudeSessionId, secret } = await req.json();

    if (process.env.AGENT_POLL_SECRET && secret !== process.env.AGENT_POLL_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    // Record heartbeat on result submission too
    globalThis.__agentHeartbeat.lastPoll = new Date().toISOString();

    const data = {};
    if (status) data.status = status;
    if (response) data.response = response;
    if (error) data.error = error;

    await prisma.agentTask.update({
      where: { id: taskId },
      data,
    });

    // Update claudeSessionId on the session for continuity
    if (claudeSessionId) {
      const task = await prisma.agentTask.findUnique({
        where: { id: taskId },
        select: { sessionId: true },
      });
      if (task) {
        await prisma.agentSession.update({
          where: { id: task.sessionId },
          data: { claudeSessionId },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Agent poll POST error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
