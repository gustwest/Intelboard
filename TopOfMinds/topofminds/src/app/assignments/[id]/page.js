import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import AssignmentHeader from './AssignmentHeader';
import MatchesPanel from './MatchesPanel';
import SourcePanel from './SourcePanel';

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

export default async function AssignmentDetail({ params }) {
  await requireAdmin();
  const { id } = await params;

  const [assignment, consultants] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id },
      include: {
        matches: {
          include: {
            consultant: {
              select: {
                id: true, firstName: true, lastName: true, title: true,
                team: true, status: true, wantsNewAssignment: true, avatarUrl: true,
              },
            },
          },
          orderBy: { score: 'desc' },
        },
        applications: {
          include: { consultant: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.consultant.findMany({
      orderBy: [{ firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, title: true, status: true },
    }),
  ]);

  if (!assignment) notFound();

  const appsByConsultant = new Map(assignment.applications.map((a) => [a.consultantId, a]));

  const serialized = {
    ...assignment,
    requiredSkills: safeArray(assignment.requiredSkills),
    preferredSkills: safeArray(assignment.preferredSkills),
    languageRequirements: safeArray(assignment.languageRequirements),
    matches: assignment.matches.map((m) => ({
      ...m,
      matchedSkills: safeArray(m.matchedSkills),
      missingSkills: safeArray(m.missingSkills),
      strengths: safeArray(m.strengths),
      concerns: safeArray(m.concerns),
      application: appsByConsultant.get(m.consultantId) || null,
    })),
  };

  return (
    <div className="page">
      <Link href="/assignments" className="page-back">← Tillbaka till uppdrag</Link>
      <AssignmentHeader assignment={serialized} consultants={consultants} />

      <div className="assignment-layout">
        <div className="assignment-main">
          <MatchesPanel assignment={serialized} />
        </div>
        <aside className="assignment-side">
          <SourcePanel assignment={serialized} />
        </aside>
      </div>
    </div>
  );
}
