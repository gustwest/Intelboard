import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/dal';
import ProfileEditor from './ProfileEditor';

export const metadata = { title: 'Min profil — TopOfMinds' };
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

export default async function MyProfilePage() {
  const user = await requireAuth();

  if (!user.consultantId) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Min profil</h1>
        </div>
        <div className="ai-usage-card">
          <h3>Profil ej kopplad</h3>
          <p className="ai-empty">
            Ditt konto är inte kopplat till någon konsultprofil. Kontakta admin.
          </p>
        </div>
      </div>
    );
  }

  const consultant = await prisma.consultant.findUnique({ where: { id: user.consultantId } });
  if (!consultant) {
    return <div className="page"><p>Profil hittades inte.</p></div>;
  }

  const initial = {
    title: consultant.title || '',
    bio: consultant.bio || '',
    interests: consultant.interests || '',
    developmentGoals: consultant.developmentGoals || '',
    status: consultant.status || 'AVAILABLE',
    wantsNewAssignment: consultant.wantsNewAssignment || false,
    phone: consultant.phone || '',
    linkedin: consultant.linkedin || '',
    skills: safeArray(consultant.skills),
    industryExpertise: safeArray(consultant.industryExpertise),
    certifications: safeArray(consultant.certifications),
    languages: safeArray(consultant.languages),
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Min profil</h1>
        <p className="page-subtitle">
          Dessa uppgifter används för att matcha dig mot inkomna uppdrag. Ju fler detaljer – desto bättre matchningar.
        </p>
      </div>
      <ProfileEditor
        consultant={{ email: consultant.email, firstName: consultant.firstName, lastName: consultant.lastName }}
        initial={initial}
      />
    </div>
  );
}
