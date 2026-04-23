import { NextResponse } from 'next/server';
import { runMatchingForAssignment } from '@/lib/assignments/matching';

/**
 * POST /api/assignments/match
 * Body: { assignmentId } or { assignmentIds: [...] }
 * Triggers AI matching for one or many assignments against all consultants.
 * Auth: same intake secret (for external callers) or internal session.
 */
export async function POST(request) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET;
  const url = new URL(request.url);
  const providedSecret =
    url.searchParams.get('secret') || request.headers.get('x-intake-secret');

  // Allow if authenticated via secret or via cookie session (TODO: check session)
  if (providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const assignmentIds = body.assignmentIds
    ? body.assignmentIds
    : body.assignmentId
      ? [body.assignmentId]
      : [];

  if (assignmentIds.length === 0) {
    return NextResponse.json({ error: 'assignmentId or assignmentIds required' }, { status: 400 });
  }

  const results = [];
  for (const id of assignmentIds) {
    try {
      const result = await runMatchingForAssignment({
        assignmentId: id,
        userId: null,
        concurrency: 5,
      });
      results.push({ assignmentId: id, ok: true, ...result });
    } catch (error) {
      results.push({ assignmentId: id, ok: false, error: error?.message });
    }
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    results,
  });
}
