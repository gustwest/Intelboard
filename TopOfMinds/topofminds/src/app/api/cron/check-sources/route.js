import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkSource } from '@/lib/scrapers/engine';

/**
 * POST /api/cron/check-sources — scheduled check of all enabled broker sources
 * Auth via CRON_SECRET or INTAKE_WEBHOOK_SECRET header
 */
export async function POST(req) {
  const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('x-cron-secret');
  const validSecret = process.env.CRON_SECRET || process.env.INTAKE_WEBHOOK_SECRET;

  if (!secret || secret !== validSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all enabled sources that are due for checking
    const sources = await prisma.brokerSource.findMany({
      where: { enabled: true },
    });

    const now = new Date();
    const results = [];

    for (const source of sources) {
      // Skip if checked recently (within checkIntervalMin)
      if (source.lastCheckedAt) {
        const elapsed = (now - source.lastCheckedAt) / 60000; // minutes
        if (elapsed < source.checkIntervalMin) {
          results.push({ sourceId: source.id, name: source.name, skipped: true, reason: 'too_recent' });
          continue;
        }
      }

      try {
        const result = await checkSource(source);

        await prisma.brokerSource.update({
          where: { id: source.id },
          data: {
            lastCheckedAt: now,
            lastResult: result.ok ? `SUCCESS: ${result.found} nya uppdrag` : `ERROR: ${result.error}`,
            assignmentsFound: { increment: result.found || 0 },
          },
        });

        results.push({ sourceId: source.id, name: source.name, ...result });
      } catch (err) {
        await prisma.brokerSource.update({
          where: { id: source.id },
          data: {
            lastCheckedAt: now,
            lastResult: `ERROR: ${err.message}`,
          },
        });
        results.push({ sourceId: source.id, name: source.name, ok: false, error: err.message });
      }
    }

    return NextResponse.json({ ok: true, checked: results.length, results });
  } catch (err) {
    console.error('[cron/check-sources] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
