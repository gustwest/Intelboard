import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import { toggleModelEnabled } from '@/app/admin/ai/actions';

export const metadata = { title: 'Modellregister — TopOfMinds' };
export const dynamic = 'force-dynamic';

function formatPrice(n) {
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export default async function ModelsPage() {
  await requireAdmin();

  const models = await prisma.modelRegistry.findMany({
    orderBy: [{ provider: 'asc' }, { category: 'asc' }, { displayName: 'asc' }],
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/admin/ai" className="page-back">← Tillbaka</Link>
          <h1 className="page-title">Modellregister</h1>
          <p className="page-subtitle">
            Alla tillgängliga modeller via Vertex AI. Priser i USD per miljon tokens.
          </p>
        </div>
      </div>

      <div className="ai-models-table-wrap">
        <table className="ai-models-table">
          <thead>
            <tr>
              <th>Modell</th>
              <th>Provider</th>
              <th>Kategori</th>
              <th>Context</th>
              <th>In / Ut (USD/MTok)</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.modelId} className={m.enabled ? '' : 'ai-model-disabled'}>
                <td>
                  <div className="ai-model-name">{m.displayName}</div>
                  <div className="ai-model-id">{m.modelId}</div>
                  {m.notes && <div className="ai-model-notes">{m.notes}</div>}
                </td>
                <td>{m.provider === 'GOOGLE' ? 'Google' : m.provider === 'ANTHROPIC' ? 'Anthropic' : m.provider}</td>
                <td><span className={`ai-cat ai-cat-${m.category.toLowerCase()}`}>{m.category}</span></td>
                <td>{m.contextWindow.toLocaleString('sv-SE')}</td>
                <td>
                  {formatPrice(m.inputPricePerMTok)} / {formatPrice(m.outputPricePerMTok)}
                </td>
                <td>
                  {m.enabled ? <span className="ai-on">Aktiv</span> : <span className="ai-off">Inaktiv</span>}
                </td>
                <td>
                  <form action={toggleModelEnabled}>
                    <input type="hidden" name="modelId" value={m.modelId} />
                    <input type="hidden" name="enabled" value={String(!m.enabled)} />
                    <button type="submit" className="ai-toggle-btn">
                      {m.enabled ? 'Inaktivera' : 'Aktivera'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
