import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkSource } from '@/lib/scrapers/engine';

/**
 * POST /api/admin/sources/check-all — trigger all enabled sources sequentially.
 * Returns a summary report of results per source.
 */
export async function POST() {
  try {
    const sources = await prisma.brokerSource.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
    });

    if (sources.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Inga aktiva källor konfigurerade',
        sources: [],
        totals: { checked: 0, found: 0, errors: 0 },
      });
    }

    const results = [];
    let totalFound = 0;
    let totalErrors = 0;

    for (const source of sources) {
      const startTime = Date.now();
      let result;

      try {
        result = await checkSource(source);
      } catch (err) {
        result = { ok: false, found: 0, error: err.message };
      }

      const elapsed = Date.now() - startTime;

      // Update source with result
      await prisma.brokerSource.update({
        where: { id: source.id },
        data: {
          lastCheckedAt: new Date(),
          lastResult: result.ok
            ? `SUCCESS: ${result.found} nya uppdrag`
            : `ERROR: ${result.error}`,
          assignmentsFound: { increment: result.found || 0 },
        },
      });

      const sourceResult = {
        id: source.id,
        name: source.name,
        type: source.type,
        ok: result.ok,
        found: result.found || 0,
        total: result.total || 0,
        error: result.error || null,
        elapsedMs: elapsed,
      };

      results.push(sourceResult);
      totalFound += result.found || 0;
      if (!result.ok) totalErrors++;
    }

    return NextResponse.json({
      ok: true,
      sources: results,
      totals: {
        checked: sources.length,
        found: totalFound,
        errors: totalErrors,
      },
    });
  } catch (err) {
    console.error('[sources/check-all] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
