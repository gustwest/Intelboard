'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, deleteSession } from '@/lib/auth/session';
import { ROLES } from '@/lib/auth/roles';

const LoginSchema = z.object({
  email: z.email({ error: 'Ogiltig e-postadress.' }).trim().toLowerCase(),
  password: z.string().min(1, { error: 'Lösenord krävs.' }),
});

const SignupSchema = z.object({
  email: z.email({ error: 'Ogiltig e-postadress.' }).trim().toLowerCase(),
  name: z.string().min(2, { error: 'Namn måste vara minst 2 tecken.' }).trim(),
  password: z
    .string()
    .min(8, { error: 'Lösenord måste vara minst 8 tecken.' })
    .regex(/[a-zA-Z]/, { error: 'Lösenord måste innehålla en bokstav.' })
    .regex(/[0-9]/, { error: 'Lösenord måste innehålla en siffra.' }),
});

export async function login(_prevState, formData) {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user || !user.isActive) {
    return { message: 'Felaktiga inloggningsuppgifter.' };
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { message: 'Felaktiga inloggningsuppgifter.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession({
    userId: user.id,
    role: user.role,
    consultantId: user.consultantId,
  });

  const redirectTo = user.role === ROLES.CONSULTANT ? '/my' : '/';
  redirect(redirectTo);
}

export async function signup(_prevState, formData) {
  const parsed = SignupSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return { message: 'En användare med den e-postadressen finns redan.' };
  }

  // Try to attach to existing consultant profile by email match
  const consultant = await prisma.consultant.findUnique({
    where: { email: parsed.data.email },
  });

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: ROLES.CONSULTANT,
      consultantId: consultant?.id ?? null,
    },
  });

  await createSession({
    userId: user.id,
    role: user.role,
    consultantId: user.consultantId,
  });

  redirect('/my');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
