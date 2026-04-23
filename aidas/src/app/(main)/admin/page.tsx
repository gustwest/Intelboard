import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return <AdminClient initialUsers={users as { id: string; name: string; email: string; role: string }[]} />;
}
