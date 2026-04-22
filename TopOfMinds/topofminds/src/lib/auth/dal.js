import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { readSession } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';

export const verifySession = cache(async () => {
  const session = await readSession();
  if (!session?.userId) {
    redirect('/login');
  }
  return {
    userId: String(session.userId),
    role: String(session.role),
    consultantId: session.consultantId ? String(session.consultantId) : null,
  };
});

export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      consultantId: true,
      consultant: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  if (!user || !user.isActive) return null;
  return user;
});

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user.role)) redirect('/');
  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
