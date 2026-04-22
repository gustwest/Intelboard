'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import { ROLES, isSuperadmin } from '@/lib/auth/roles';
import { hashPassword } from '@/lib/auth/password';
import { z } from 'zod';

const UpdateUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum([ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.CONSULTANT]).optional(),
  consultantId: z.string().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function updateUserAction(_prev, formData) {
  const admin = await requireAdmin();

  const parsed = UpdateUserSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role') || undefined,
    consultantId: formData.get('consultantId') === '' ? null : formData.get('consultantId') || undefined,
    isActive: formData.get('isActive') || undefined,
  });
  if (!parsed.success) return { ok: false, message: 'Ogiltig inmatning.' };
  const { userId, role, consultantId, isActive } = parsed.data;

  // Guard: only SUPERADMIN can promote to SUPERADMIN or demote a SUPERADMIN
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: 'Användaren hittas inte.' };

  if (role === ROLES.SUPERADMIN && !isSuperadmin(admin.role)) {
    return { ok: false, message: 'Bara SUPERADMIN kan tilldela SUPERADMIN-rollen.' };
  }
  if (target.role === ROLES.SUPERADMIN && role && role !== ROLES.SUPERADMIN && !isSuperadmin(admin.role)) {
    return { ok: false, message: 'Bara SUPERADMIN kan ändra en SUPERADMIN.' };
  }
  if (target.id === admin.id && isActive === false) {
    return { ok: false, message: 'Du kan inte inaktivera ditt eget konto.' };
  }

  // If linking consultantId, verify it exists and isn't already linked to someone else
  if (consultantId) {
    const existing = await prisma.user.findUnique({ where: { consultantId } });
    if (existing && existing.id !== userId) {
      return { ok: false, message: 'Den konsultprofilen är redan kopplad till en annan användare.' };
    }
  }

  const data = {};
  if (role !== undefined) data.role = role;
  if (consultantId !== undefined) data.consultantId = consultantId;
  if (isActive !== undefined) data.isActive = isActive;

  await prisma.user.update({ where: { id: userId }, data });
  revalidatePath('/admin/users');
  return { ok: true };
}

const CreateUserSchema = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
  role: z.enum([ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.CONSULTANT]),
  consultantId: z.string().optional().nullable(),
});

export async function createUserAction(_prev, formData) {
  const admin = await requireAdmin();

  const parsed = CreateUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
    role: formData.get('role'),
    consultantId: formData.get('consultantId') || null,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.role === ROLES.SUPERADMIN && !isSuperadmin(admin.role)) {
    return { ok: false, message: 'Bara SUPERADMIN kan skapa SUPERADMIN.' };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, message: 'En användare med den e-postadressen finns redan.' };

  if (parsed.data.consultantId) {
    const linked = await prisma.user.findUnique({ where: { consultantId: parsed.data.consultantId } });
    if (linked) return { ok: false, message: 'Den konsultprofilen är redan kopplad.' };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
      consultantId: parsed.data.consultantId || null,
    },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

export async function resetPasswordAction(_prev, formData) {
  await requireAdmin();
  const userId = String(formData.get('userId') || '');
  const newPassword = String(formData.get('newPassword') || '');
  if (!userId || newPassword.length < 8) {
    return { ok: false, message: 'Lösenordet måste vara minst 8 tecken.' };
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}
