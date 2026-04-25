import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkSource } from '@/lib/scrapers/engine';

/**
 * POST /api/admin/sources/:id/check — trigger an immediate check for a source
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const source = await prisma.brokerSource.findUnique({ where: { id } });

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const result = await checkSource(source);

    // Update source with result
    await prisma.brokerSource.update({
      where: { id },
      data: {
        lastCheckedAt: new Date(),
        lastResult: result.ok ? `SUCCESS: ${result.found} nya uppdrag` : `ERROR: ${result.error}`,
        assignmentsFound: { increment: result.found || 0 },
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[sources/check] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
