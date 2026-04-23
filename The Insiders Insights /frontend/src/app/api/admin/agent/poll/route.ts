/**
 * GET  /api/admin/agent/poll — Agent picks up next PENDING task
 * PATCH /api/admin/agent/poll — Agent reports status/result
 *
 * Auth: Bearer token via AGENT_API_KEY env var
 */
import { NextRequest, NextResponse } from 'next/server';
import { getNextPendingTask, updateTask, recordPoll, getSession } from '@/lib/agent-store';

function authenticate(req: NextRequest): boolean {
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${apiKey}`;
}

export async function GET(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await recordPoll({
    model: req.headers.get('x-agent-model') || undefined,
    version: req.headers.get('x-agent-version') || undefined,
    project: req.headers.get('x-agent-project') || undefined,
  });

  const task = await getNextPendingTask();
  if (!task) {
    return NextResponse.json({ task: null, timestamp: new Date().toISOString() });
  }

  // Mark as RUNNING
  await updateTask(task.id, { status: 'RUNNING' });

  // Get session to check for resumable Claude session
  const session = await getSession(task.sessionId);

  return NextResponse.json({
    task: {
      id: task.id,
      prompt: task.prompt,
      model: task.model,
      sessionId: task.sessionId,
      resumeSessionId: session?.claudeSessionId || null,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function PATCH(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { taskId, status, response, error, logs, claudeSessionId } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    await updateTask(taskId, { status, response, error, logs, claudeSessionId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Agent poll PATCH error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
