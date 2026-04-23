import { NextResponse } from 'next/server';
import { intakeAssignmentFromEmail } from '@/lib/assignments/intake';
import { runMatchingForAssignment } from '@/lib/assignments/matching';
import { cinodePayloadToText } from '@/lib/assignments/cinode';

/**
 * Cinode webhook intake.
 * Accepts Cinode's "ProjectAssignment.*" / "Request.*" / "Project.*" events
 * (and gracefully tolerates schema variations).
 *
 * Auth: same INTAKE_WEBHOOK_SECRET as the email intake — pass via
 *   ?secret=... or X-Intake-Secret header.
 *
 * Query params:
 *   ?runMatching=1  → triggers matching immediately after intake
 */
export async function POST(request) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'INTAKE_WEBHOOK_SECRET not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const providedSecret =
    url.searchParams.get('secret') || request.headers.get('x-intake-secret');
  if (providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, subject } = cinodePayloadToText(body);
  if (!text) {
    return NextResponse.json({ error: 'Cinode payload missing project data' }, { status: 400 });
  }

  try {
    const { assignment } = await intakeAssignmentFromEmail({
      emailBody: text,
      emailSubject: subject,
      sourceType: 'CINODE',
      userId: null,
    });

    if (url.searchParams.get('runMatching') === '1') {
      await runMatchingForAssignment({ assignmentId: assignment.id });
    }

    return NextResponse.json({ ok: true, assignmentId: assignment.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'intake failed' }, { status: 500 });
  }
}
