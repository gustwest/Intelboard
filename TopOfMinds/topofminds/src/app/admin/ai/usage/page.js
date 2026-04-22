import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';

export const metadata = { title: 'AI-användning — TopOfMinds' };
export const dynamic = 'force-dynamic';

async function getUsageData() {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [agg24h, agg7d, agg30d, byStep, byModel, byStatus, recent] = await Promise.all([
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since24h } },
      _sum: { estimatedCostUSD: true, inputTokens: true, outputTokens: true, latencyMs: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since7d } },
      _sum: { estimatedCostUSD: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since30d } },
      _sum: { estimatedCostUSD: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ['pipelineStep'],
      where: { createdAt: { gte: since30d } },
      _sum: { estimatedCostUSD: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ['modelId'],
      where: { createdAt: { gte: since30d } },
      _sum: { estimatedCostUSD: true, inputTokens: true, outputTokens: true, latencyMs: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since7d } },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { model: { select: { displayName: true, provider: true } } },
    }),
  ]);

  return { agg24h, agg7d, agg30d, byStep, byModel, byStatus, recent };
}

function fmt(n, digits = 2) {
  return typeof n === 'number' ? n.toFixed(digits) : '0.00';
}

export default async function UsagePage() {
  await requireAdmin();
  const { agg24h, agg7d, agg30d, byStep, byModel, byStatus, recent } = await getUsageData();

  const avgLatency24h =
    agg24h._count._all > 0
      ? Math.round((agg24h._sum.latencyMs || 0) / agg24h._count._all)
      : 0;

  const successCount = byStatus.find((s) => s.status === 'SUCCESS')?._count._all || 0;
  const errorCount = byStatus.find((s) => s.status === 'ERROR')?._count._all || 0;
  const successRate = successCount + errorCount > 0
    ? ((successCount / (successCount + errorCount)) * 100).toFixed(1)
    : '—';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/admin/ai" className="page-back">← Tillbaka</Link>
          <h1 className="page-title">AI-användning & kostnad</h1>
          <p className="page-subtitle">
            Aggregerad data från AIUsageLog. Alla belopp i USD.
          </p>
        </div>
      </div>

      <div className="ai-kpi-grid">
        <div className="ai-kpi">
          <div className="ai-kpi-label">Kostnad 24h</div>
          <div className="ai-kpi-value">${fmt(agg24h._sum.estimatedCostUSD || 0)}</div>
          <div className="ai-kpi-sub">{agg24h._count._all} anrop</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Kostnad 7d</div>
          <div className="ai-kpi-value">${fmt(agg7d._sum.estimatedCostUSD || 0)}</div>
          <div className="ai-kpi-sub">{agg7d._count._all} anrop</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Kostnad 30d</div>
          <div className="ai-kpi-value">${fmt(agg30d._sum.estimatedCostUSD || 0)}</div>
          <div className="ai-kpi-sub">{agg30d._count._all} anrop</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Success rate (7d)</div>
          <div className="ai-kpi-value">{successRate}%</div>
          <div className="ai-kpi-sub">{errorCount} fel</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Snittlatens 24h</div>
          <div className="ai-kpi-value">{avgLatency24h}ms</div>
        </div>
      </div>

      <div className="ai-usage-grid">
        <div className="ai-usage-card">
          <h3>Per pipeline-steg (30d)</h3>
          {byStep.length === 0 ? (
            <p className="ai-empty">Ingen användning ännu.</p>
          ) : (
            <table className="ai-usage-table">
              <thead>
                <tr>
                  <th>Steg</th>
                  <th>Anrop</th>
                  <th>Tokens</th>
                  <th>Kostnad</th>
                </tr>
              </thead>
              <tbody>
                {byStep
                  .sort((a, b) => (b._sum.estimatedCostUSD || 0) - (a._sum.estimatedCostUSD || 0))
                  .map((r) => (
                    <tr key={r.pipelineStep}>
                      <td>{r.pipelineStep}</td>
                      <td>{r._count._all}</td>
                      <td>{((r._sum.inputTokens || 0) + (r._sum.outputTokens || 0)).toLocaleString('sv-SE')}</td>
                      <td>${fmt(r._sum.estimatedCostUSD || 0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="ai-usage-card">
          <h3>Per modell (30d)</h3>
          {byModel.length === 0 ? (
            <p className="ai-empty">Ingen användning ännu.</p>
          ) : (
            <table className="ai-usage-table">
              <thead>
                <tr>
                  <th>Modell</th>
                  <th>Anrop</th>
                  <th>Snittlatens</th>
                  <th>Kostnad</th>
                </tr>
              </thead>
              <tbody>
                {byModel
                  .sort((a, b) => (b._sum.estimatedCostUSD || 0) - (a._sum.estimatedCostUSD || 0))
                  .map((r) => {
                    const avg = r._count._all > 0 ? Math.round((r._sum.latencyMs || 0) / r._count._all) : 0;
                    return (
                      <tr key={r.modelId}>
                        <td>{r.modelId}</td>
                        <td>{r._count._all}</td>
                        <td>{avg}ms</td>
                        <td>${fmt(r._sum.estimatedCostUSD || 0)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="ai-usage-card">
        <h3>Senaste 20 anropen</h3>
        {recent.length === 0 ? (
          <p className="ai-empty">Ingen loggdata ännu — första AI-anropet skrivs hit när en pipeline körs.</p>
        ) : (
          <table className="ai-usage-table">
            <thead>
              <tr>
                <th>Tid</th>
                <th>Steg</th>
                <th>Modell</th>
                <th>Roll</th>
                <th>Tokens</th>
                <th>Latens</th>
                <th>Kostnad</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString('sv-SE')}</td>
                  <td>{r.pipelineStep}</td>
                  <td>{r.model?.displayName || r.modelId}</td>
                  <td>{r.role}</td>
                  <td>{(r.inputTokens + r.outputTokens).toLocaleString('sv-SE')}</td>
                  <td>{r.latencyMs}ms</td>
                  <td>${fmt(r.estimatedCostUSD, 4)}</td>
                  <td>
                    {r.status === 'SUCCESS' ? (
                      <span className="ai-on">OK</span>
                    ) : (
                      <span className="ai-off" title={r.errorMessage || ''}>FEL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
