import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';

export const metadata = { title: 'Uppdrag — TopOfMinds' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  NEW: { label: 'Nytt', cls: 'status-new' },
  MATCHED: { label: 'Matchat', cls: 'status-matched' },
  SENT: { label: 'Skickat', cls: 'status-sent' },
  CLOSED: { label: 'Stängt', cls: 'status-closed' },
  ARCHIVED: { label: 'Arkiverat', cls: 'status-archived' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('sv-SE');
}

function daysUntil(d) {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export default async function AssignmentsPage() {
  await requireAdmin();

  const assignments = await prisma.assignment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      matches: { select: { score: true }, orderBy: { score: 'desc' } },
      applications: { select: { status: true } },
    },
  });

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 className="page-title">Uppdrag</h1>
          <p className="page-subtitle">
            Inkomna mäklarförfrågningar. Nya uppdrag extraheras automatiskt från mail, matchas mot konsultprofiler och rankas.
          </p>
        </div>
        <Link href="/assignments/new" className="ai-save-btn" style={{ textDecoration: 'none', display: 'inline-block', padding: '10px 18px' }}>
          + Nytt uppdrag
        </Link>
      </div>

      {assignments.length === 0 ? (
        <div className="ai-usage-card">
          <h3>Inga uppdrag ännu</h3>
          <p className="ai-empty">
            Klistra in ett mäklarmail via "Nytt uppdrag" eller konfigurera webhook-intag på <code>/api/assignments/intake</code>.
          </p>
        </div>
      ) : (
        <div className="ai-models-table-wrap">
          <table className="ai-models-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Kund</th>
                <th>Period</th>
                <th>Deadline</th>
                <th>Matchningar</th>
                <th>Ansökningar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const dl = daysUntil(a.applicationDeadline);
                const topScore = a.matches[0]?.score;
                const top70 = a.matches.filter((m) => m.score >= 70).length;
                const applied = a.applications.filter((app) => app.status === 'APPLIED' || app.status === 'WON').length;
                const st = STATUS_LABELS[a.status] || STATUS_LABELS.NEW;
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/assignments/${a.id}`} className="ai-model-name" style={{ textDecoration: 'none', color: 'inherit' }}>
                        {a.title}
                      </Link>
                      {a.brokerName && <div className="ai-model-id">Via {a.brokerName}</div>}
                    </td>
                    <td>{a.clientName || '—'}</td>
                    <td>
                      {fmtDate(a.startDate)} → {fmtDate(a.endDate)}
                    </td>
                    <td>
                      {a.applicationDeadline ? (
                        <span className={dl !== null && dl <= 2 ? 'ai-off' : ''}>
                          {fmtDate(a.applicationDeadline)} {dl !== null && `(${dl}d)`}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {a.matches.length === 0 ? '—' : (
                        <span>
                          <strong>{top70}</strong> ≥70%
                          {topScore != null && <span className="ai-model-id"> · topp {topScore}%</span>}
                        </span>
                      )}
                    </td>
                    <td>{applied > 0 ? `${applied} ansökt` : a.applications.length > 0 ? `${a.applications.length} utkast` : '—'}</td>
                    <td><span className={`assignment-status ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
