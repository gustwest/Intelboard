import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/dal';
import prisma from '@/lib/prisma';
import { calculateCostUSD } from '@/lib/ai/pricing';

export const metadata = { title: 'AI-inställningar — TopOfMinds' };
export const dynamic = 'force-dynamic';

async function getSummary() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [last24h, last30d, settings, modelsCount] = await Promise.all([
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since24h } },
      _sum: { estimatedCostUSD: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since30d } },
      _sum: { estimatedCostUSD: true },
      _count: { _all: true },
    }),
    prisma.aISetting.findMany({
      include: {
        champion: { select: { modelId: true, displayName: true, provider: true } },
        challenger: { select: { modelId: true, displayName: true, provider: true } },
      },
    }),
    prisma.modelRegistry.count({ where: { enabled: true } }),
  ]);

  return { last24h, last30d, settings, modelsCount };
}

function Kpi({ label, value, sub }) {
  return (
    <div className="ai-kpi">
      <div className="ai-kpi-label">{label}</div>
      <div className="ai-kpi-value">{value}</div>
      {sub && <div className="ai-kpi-sub">{sub}</div>}
    </div>
  );
}

export default async function AIAdminPage() {
  await requireAdmin();
  const { last24h, last30d, settings, modelsCount } = await getSummary();

  const cost24h = (last24h._sum.estimatedCostUSD || 0).toFixed(2);
  const tokens24h = (last24h._sum.inputTokens || 0) + (last24h._sum.outputTokens || 0);
  const cost30d = (last30d._sum.estimatedCostUSD || 0).toFixed(2);
  const calls30d = last30d._count._all || 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">AI-inställningar</h1>
        <p className="page-subtitle">
          Modellkonfiguration, A/B-testning och kostnadsuppföljning för alla AI-pipelines.
        </p>
      </div>

      <div className="ai-kpi-grid">
        <Kpi label="Kostnad 24h" value={`$${cost24h}`} sub={`${last24h._count._all || 0} anrop`} />
        <Kpi label="Tokens 24h" value={tokens24h.toLocaleString('sv-SE')} />
        <Kpi label="Kostnad 30d" value={`$${cost30d}`} sub={`${calls30d} anrop`} />
        <Kpi label="Aktiva modeller" value={String(modelsCount)} />
      </div>

      <div className="ai-nav">
        <Link href="/admin/ai/settings" className="ai-nav-card">
          <div className="ai-nav-title">Pipeline-inställningar</div>
          <div className="ai-nav-desc">Champion/Challenger per steg, shadow-mode och prompt.</div>
          <div className="ai-nav-meta">{settings.length} steg konfigurerade</div>
        </Link>
        <Link href="/admin/ai/usage" className="ai-nav-card">
          <div className="ai-nav-title">Användning & kostnad</div>
          <div className="ai-nav-desc">Detaljerad breakdown per modell, steg och tid.</div>
        </Link>
        <Link href="/admin/ai/models" className="ai-nav-card">
          <div className="ai-nav-title">Modellregister</div>
          <div className="ai-nav-desc">Tillgängliga modeller, priser, aktivering.</div>
          <div className="ai-nav-meta">{modelsCount} aktiva</div>
        </Link>
        <Link href="/admin/ai/shadow" className="ai-nav-card">
          <div className="ai-nav-title">A/B-jämförelser</div>
          <div className="ai-nav-desc">Champion vs challenger side-by-side, blind review.</div>
        </Link>
      </div>
    </div>
  );
}
