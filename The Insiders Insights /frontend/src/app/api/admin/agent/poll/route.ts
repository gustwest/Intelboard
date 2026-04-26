/**
 * GET  /api/admin/agent/poll — Agent picks up next PENDING task
 * PATCH /api/admin/agent/poll — Agent reports status/result
 *
 * Auth: Bearer token via AGENT_API_KEY env var
 *
 * State lives on the backend; this route is a thin authenticated proxy
 * so the local CLI poller's API surface stays unchanged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pollNextTask, reportTaskUpdate } from '@/lib/agent-store';

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

  try {
    const data = await pollNextTask({
      model: req.headers.get('x-agent-model') || undefined,
      version: req.headers.get('x-agent-version') || undefined,
      project: req.headers.get('x-agent-project') || undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('Agent poll GET error:', err);
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }
    await reportTaskUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Agent poll PATCH error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
