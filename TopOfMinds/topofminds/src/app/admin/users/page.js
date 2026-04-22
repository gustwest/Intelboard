import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import UsersTable from './UsersTable';
import CreateUserForm from './CreateUserForm';

export const metadata = { title: 'Användare — TopOfMinds' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const admin = await requireAdmin();

  const [users, consultants] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        consultant: { select: { id: true, firstName: true, lastName: true, title: true } },
      },
    }),
    prisma.consultant.findMany({
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, user: { select: { id: true } } },
    }),
  ]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Användare</h1>
        <p className="page-subtitle">
          Hantera inloggningar, roller och koppla konsultkonton till profiler.
        </p>
      </div>

      <div className="users-grid">
        <div className="users-main">
          <UsersTable users={users} consultants={consultants} currentUserId={admin.id} currentUserRole={admin.role} />
        </div>
        <aside className="users-side">
          <CreateUserForm consultants={consultants} currentUserRole={admin.role} />
        </aside>
      </div>
    </div>
  );
}
