import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/dal';

export const metadata = { title: 'Mina uppdrag — TopOfMinds' };
export const dynamic = 'force-dynamic';

export default async function MyPage() {
  const user = await requireAuth();

  const consultant = user.consultantId
    ? await prisma.consultant.findUnique({
        where: { id: user.consultantId },
        include: {
          contracts: {
            include: { client: true },
            orderBy: { endDate: 'desc' },
            take: 5,
          },
        },
      })
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Hej {user.name || user.email.split('@')[0]} 👋</h1>
        <p className="page-subtitle">
          {consultant
            ? 'Här kommer dina matchade uppdrag att visas när mäklarförfrågningar kommer in.'
            : 'Vi kunde inte hitta din konsultprofil automatiskt. En admin behöver koppla ditt konto till rätt profil.'}
        </p>
      </div>

      {!consultant && (
        <div className="ai-usage-card">
          <h3>Profil ej kopplad</h3>
          <p className="ai-empty">
            Ditt konto (<strong>{user.email}</strong>) är inte kopplat till någon konsultprofil i systemet.
            Kontakta en admin så kopplar de ditt konto.
          </p>
        </div>
      )}

      {consultant && (
        <>
          <div className="ai-kpi-grid">
            <div className="ai-kpi">
              <div className="ai-kpi-label">Status</div>
              <div className="ai-kpi-value" style={{ fontSize: 18 }}>
                {consultant.status === 'AVAILABLE' ? 'Tillgänglig' : consultant.status === 'ON_CONTRACT' ? 'På uppdrag' : 'Ledig'}
              </div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-label">Öppen för nytt uppdrag</div>
              <div className="ai-kpi-value" style={{ fontSize: 18 }}>
                {consultant.wantsNewAssignment ? 'Ja' : 'Nej'}
              </div>
            </div>
            <div className="ai-kpi">
              <div className="ai-kpi-label">Nya matchningar</div>
              <div className="ai-kpi-value">—</div>
              <div className="ai-kpi-sub">Matchning kommer snart</div>
            </div>
          </div>

          <div className="ai-usage-card">
            <h3>Dina senaste kontrakt</h3>
            {consultant.contracts.length === 0 ? (
              <p className="ai-empty">Inga kontrakt registrerade.</p>
            ) : (
              <table className="ai-usage-table">
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Kund</th>
                    <th>Period</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {consultant.contracts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td>{c.client?.name || '—'}</td>
                      <td>
                        {new Date(c.startDate).toLocaleDateString('sv-SE')} →{' '}
                        {new Date(c.endDate).toLocaleDateString('sv-SE')}
                      </td>
                      <td>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="ai-usage-card" style={{ marginTop: 16 }}>
            <h3>Kommer snart</h3>
            <p className="ai-empty">
              Matchningar mot inkomna mäklaruppdrag, AI-genererade CV-utkast och ansökningshistorik
              visas här när pipeline-funktionerna är aktiverade.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
