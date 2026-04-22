import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import ComparisonList from './ComparisonList';

export const metadata = { title: 'A/B-jämförelser — TopOfMinds' };
export const dynamic = 'force-dynamic';

export default async function ShadowPage() {
  await requireAdmin();

  // Find jobIds that have both CHAMPION and CHALLENGER rows
  const shadowRows = await prisma.aIShadowResult.findMany({
    orderBy: { createdAt: 'desc' },
    take: 400, // up to ~200 pairs
    include: {
      comparisons: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Group by jobId
  const pairs = new Map();
  for (const r of shadowRows) {
    if (!pairs.has(r.jobId)) pairs.set(r.jobId, { jobId: r.jobId, champion: null, challenger: null });
    const pair = pairs.get(r.jobId);
    if (r.role === 'CHAMPION') pair.champion = r;
    else if (r.role === 'CHALLENGER') pair.challenger = r;
  }

  const complete = [...pairs.values()]
    .filter((p) => p.champion && p.challenger)
    .slice(0, 50);

  // Aggregate comparison stats
  const comparisons = await prisma.aIComparison.groupBy({
    by: ['preference'],
    _count: { _all: true },
  });
  const prefCount = Object.fromEntries(comparisons.map((c) => [c.preference, c._count._all]));
  const total = (prefCount.A_BETTER || 0) + (prefCount.B_BETTER || 0) + (prefCount.TIE || 0);

  return (
    <div className="page">
      <div className="page-header">
        <Link href="/admin/ai" className="page-back">← Tillbaka</Link>
        <h1 className="page-title">A/B-jämförelser</h1>
        <p className="page-subtitle">
          Jämför champion- vs challenger-modellens output sida vid sida. Använd tangenterna för snabb review.
        </p>
      </div>

      <div className="ai-kpi-grid">
        <div className="ai-kpi">
          <div className="ai-kpi-label">Totalt jämförelser</div>
          <div className="ai-kpi-value">{total}</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Champion vinner</div>
          <div className="ai-kpi-value">{prefCount.A_BETTER || 0}</div>
          <div className="ai-kpi-sub">{total > 0 ? `${Math.round(((prefCount.A_BETTER || 0) / total) * 100)}%` : '—'}</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Challenger vinner</div>
          <div className="ai-kpi-value">{prefCount.B_BETTER || 0}</div>
          <div className="ai-kpi-sub">{total > 0 ? `${Math.round(((prefCount.B_BETTER || 0) / total) * 100)}%` : '—'}</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Likvärdigt</div>
          <div className="ai-kpi-value">{prefCount.TIE || 0}</div>
        </div>
      </div>

      {complete.length === 0 ? (
        <div className="ai-usage-card">
          <h3>Inga A/B-par ännu</h3>
          <p className="ai-empty">
            Aktivera shadow-mode på ett pipeline-steg och kör några uppdrag/matchningar – sedan visas jämförelserna här.
          </p>
        </div>
      ) : (
        <ComparisonList pairs={complete} />
      )}
    </div>
  );
}
