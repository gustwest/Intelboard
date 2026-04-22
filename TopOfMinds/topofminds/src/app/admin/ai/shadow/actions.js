'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';

export async function recordComparisonAction({ shadowResultId, preference, notes }) {
  const admin = await requireAdmin();
  const allowed = ['A_BETTER', 'B_BETTER', 'TIE'];
  if (!allowed.includes(preference)) return { ok: false };
  if (!shadowResultId) return { ok: false };

  await prisma.aIComparison.create({
    data: {
      shadowResultId,
      reviewerId: admin.id,
      preference,
      notes: notes?.slice(0, 1000) || null,
    },
  });
  revalidatePath('/admin/ai/shadow');
  return { ok: true };
}
