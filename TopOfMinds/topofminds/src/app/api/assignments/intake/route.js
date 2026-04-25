import { NextResponse } from 'next/server';
import { intakeAssignmentFromEmail } from '@/lib/assignments/intake';
import { runMatchingForAssignment } from '@/lib/assignments/matching';

/**
 * Inbound email webhook (Postmark/SendGrid-compatible).
 * Auth via INTAKE_WEBHOOK_SECRET as ?secret=... query param or X-Intake-Secret header.
 *
 * Accepted payload shapes:
 *   1. Our own: { emailBody, emailSubject }
 *   2. Postmark inbound: { TextBody, HtmlBody, Subject, From, FromName }
 *   3. SendGrid inbound: { text, subject, from }
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

  // Normalize across common webhook shapes + scraper payloads
  const emailBody = body.emailBody || body.TextBody || body.text || body.bodyPlain || body.body;
  const emailSubject = body.emailSubject || body.Subject || body.subject;
  const sourceType = body.source || 'EMAIL'; // BROKER_SCRAPE from scrapers
  const brokerFrom = body.from || null;

  if (!emailBody || typeof emailBody !== 'string' || emailBody.trim().length === 0) {
    return NextResponse.json({ error: 'emailBody required' }, { status: 400 });
  }

  try {
    const { assignment } = await intakeAssignmentFromEmail({
      emailBody,
      emailSubject,
      sourceType,
      userId: null,
      brokerFrom,
    });

    if (url.searchParams.get('runMatching') === '1') {
      await runMatchingForAssignment({ assignmentId: assignment.id });
    }

    return NextResponse.json({ ok: true, assignmentId: assignment.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'intake failed' }, { status: 500 });
  }
}
