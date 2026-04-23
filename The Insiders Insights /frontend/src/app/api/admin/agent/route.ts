/**
 * GET  /api/admin/agent — List all sessions with tasks
 * POST /api/admin/agent — Create a new task (optionally in an existing session)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessions, createTask } from '@/lib/agent-store';

export async function GET() {
  const sessions = await getSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, sessionId, model } = await req.json();

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const result = await createTask(prompt.trim(), sessionId, model);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Agent POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
