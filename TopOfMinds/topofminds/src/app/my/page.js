import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/dal';

export const metadata = { title: 'Mina uppdrag — TopOfMinds' };
export const dynamic = 'force-dynamic';

function safeArray(v) {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('sv-SE');
}

function recLabel(r) {
  switch (r) {
    case 'STRONG_MATCH': return { label: 'Stark match', cls: 'rec-strong' };
    case 'GOOD_MATCH': return { label: 'Bra match', cls: 'rec-good' };
    case 'POSSIBLE': return { label: 'Möjlig', cls: 'rec-possible' };
    case 'POOR': return { label: 'Svag', cls: 'rec-poor' };
    default: return { label: '—', cls: '' };
  }
}

function scoreCls(score) {
  if (score >= 85) return 'score-strong';
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-possible';
  return 'score-poor';
}

export default async function MyPage() {
  const user = await requireAuth();

  if (!user.consultantId) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Hej {user.name || user.email.split('@')[0]} 👋</h1>
        </div>
        <div className="ai-usage-card">
          <h3>Profil ej kopplad</h3>
          <p className="ai-empty">
            Ditt konto (<strong>{user.email}</strong>) är inte kopplat till någon konsultprofil.
            Kontakta en admin så kopplar de ditt konto till rätt profil.
          </p>
        </div>
      </div>
    );
  }

  const [consultant, matches] = await Promise.all([
    prisma.consultant.findUnique({ where: { id: user.consultantId } }),
    prisma.assignmentMatch.findMany({
      where: {
        consultantId: user.consultantId,
        score: { gte: 50 },
        assignment: { status: { not: 'ARCHIVED' } },
      },
      include: {
        assignment: true,
      },
      orderBy: { score: 'desc' },
      take: 20,
    }),
  ]);

  const applications = await prisma.application.findMany({
    where: { consultantId: user.consultantId },
    include: { assignment: { select: { id: true, title: true, clientName: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  const strongCount = matches.filter((m) => m.score >= 85).length;
  const goodCount = matches.filter((m) => m.score >= 70 && m.score < 85).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Hej {consultant?.firstName || user.name} 👋</h1>
        <p className="page-subtitle">
          Här är dina aktuella matchningar från inkomna mäklarförfrågningar.
        </p>
      </div>

      <div className="ai-kpi-grid">
        <div className="ai-kpi">
          <div className="ai-kpi-label">Starka matchningar</div>
          <div className="ai-kpi-value">{strongCount}</div>
          <div className="ai-kpi-sub">≥85%</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Bra matchningar</div>
          <div className="ai-kpi-value">{goodCount}</div>
          <div className="ai-kpi-sub">70-84%</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Status</div>
          <div className="ai-kpi-value" style={{ fontSize: 18 }}>
            {consultant?.status === 'AVAILABLE' ? 'Tillgänglig' : consultant?.status === 'ON_CONTRACT' ? 'På uppdrag' : 'Ledig'}
          </div>
          <div className="ai-kpi-sub">{consultant?.wantsNewAssignment ? 'Öppen för nytt uppdrag' : ''}</div>
        </div>
        <div className="ai-kpi">
          <div className="ai-kpi-label">Aktiva ansökningar</div>
          <div className="ai-kpi-value">{applications.filter((a) => a.status === 'APPLIED').length}</div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', margin: '24px 0 12px' }}>Matchade uppdrag</h2>

      {matches.length === 0 ? (
        <div className="ai-usage-card">
          <p className="ai-empty">Inga aktuella matchningar. När ett nytt uppdrag kommer in och matchas får du det här.</p>
        </div>
      ) : (
        <div className="matches-list">
          {matches.map((m) => {
            const rec = recLabel(m.recommendation);
            const strengths = safeArray(m.strengths);
            const a = m.assignment;
            return (
              <div key={m.id} className="match-card">
                <div className="match-card-head">
                  <div className={`match-score ${scoreCls(m.score)}`}>{m.score}%</div>
                  <div className="match-consultant">
                    <div className="match-name">{a.title}</div>
                    <div className="match-sub">
                      {a.clientName || '—'}
                      {a.location && <span> · {a.location}</span>}
                      {a.startDate && <span> · start {fmtDate(a.startDate)}</span>}
                      {a.applicationDeadline && <span> · deadline {fmtDate(a.applicationDeadline)}</span>}
                    </div>
                  </div>
                  <div className={`match-rec ${rec.cls}`}>{rec.label}</div>
                  <div className="match-summary">{m.summary}</div>
                </div>
                {strengths.length > 0 && (
                  <div className="match-card-body">
                    <div className="match-section">
                      <h4>Varför du passar</h4>
                      <ul>{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {applications.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', margin: '28px 0 12px' }}>Dina ansökningar</h2>
          <div className="ai-usage-card">
            <table className="ai-usage-table">
              <thead>
                <tr><th>Uppdrag</th><th>Kund</th><th>Status</th><th>Uppdaterad</th></tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id}>
                    <td>{app.assignment.title}</td>
                    <td>{app.assignment.clientName || '—'}</td>
                    <td>{app.status}</td>
                    <td>{new Date(app.updatedAt).toLocaleDateString('sv-SE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
