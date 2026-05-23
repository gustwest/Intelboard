/**
 * GET  /api/admin/agent — List all sessions with tasks
 * POST /api/admin/agent — Create a new task (optionally in an existing session)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessions, createTask } from '@/lib/agent-store';

export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get('product') || undefined;
  const sessions = await getSessions(product);
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, sessionId, model, imageBase64, imageContentType, product } = await req.json();

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const image = imageBase64 ? { base64: imageBase64, contentType: imageContentType || 'image/png' } : null;
    const result = await createTask(prompt.trim(), sessionId, model, image, product);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Agent POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
