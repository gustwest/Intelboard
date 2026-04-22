import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/dal';

export const metadata = { title: 'Min profil — TopOfMinds' };
export const dynamic = 'force-dynamic';

export default async function MyProfilePage() {
  const user = await requireAuth();
  const consultant = user.consultantId
    ? await prisma.consultant.findUnique({ where: { id: user.consultantId } })
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Min profil</h1>
        <p className="page-subtitle">
          Redigering av skills, intressen, erfarenhet och CV kommer här i nästa fas.
        </p>
      </div>

      <div className="ai-usage-card">
        <h3>Kontaktuppgifter</h3>
        <table className="ai-usage-table">
          <tbody>
            <tr><td>Namn</td><td>{user.name || '—'}</td></tr>
            <tr><td>E-post</td><td>{user.email}</td></tr>
            <tr><td>Roll</td><td>{user.role}</td></tr>
            {consultant && (
              <>
                <tr><td>Titel</td><td>{consultant.title || '—'}</td></tr>
                <tr><td>Team</td><td>{consultant.team || '—'}</td></tr>
                <tr><td>Status</td><td>{consultant.status}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {!consultant && (
        <div className="ai-usage-card" style={{ marginTop: 16 }}>
          <h3>Profil ej kopplad</h3>
          <p className="ai-empty">
            Ditt användarkonto är inte kopplat till en konsultprofil. Kontakta admin.
          </p>
        </div>
      )}
    </div>
  );
}
