'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/dal';
import { z } from 'zod';

const ProfileSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  bio: z.string().trim().max(4000).optional().nullable(),
  interests: z.string().trim().max(2000).optional().nullable(),
  developmentGoals: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['AVAILABLE', 'ON_CONTRACT', 'ON_LEAVE']).optional(),
  wantsNewAssignment: z.coerce.boolean().optional(),
  skills: z.string().optional(),          // JSON array string from client
  industryExpertise: z.string().optional(), // JSON array string
  certifications: z.string().optional(),  // JSON array of {name, year}
  languages: z.string().optional(),       // JSON array of {language, level}
  phone: z.string().trim().max(50).optional().nullable(),
  linkedin: z.string().trim().max(300).optional().nullable(),
});

function safeArrayJson(s) {
  if (!s) return null;
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) && a.length > 0 ? JSON.stringify(a) : null;
  } catch {
    return null;
  }
}

export async function updateMyProfileAction(_prev, formData) {
  const user = await requireAuth();
  if (!user.consultantId) {
    return { ok: false, message: 'Ingen konsultprofil kopplad till ditt konto.' };
  }

  const raw = {
    title: formData.get('title'),
    bio: formData.get('bio'),
    interests: formData.get('interests'),
    developmentGoals: formData.get('developmentGoals'),
    status: formData.get('status') || undefined,
    wantsNewAssignment: formData.get('wantsNewAssignment') === 'on',
    skills: formData.get('skills'),
    industryExpertise: formData.get('industryExpertise'),
    certifications: formData.get('certifications'),
    languages: formData.get('languages'),
    phone: formData.get('phone'),
    linkedin: formData.get('linkedin'),
  };

  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Ogiltig inmatning.' };
  const d = parsed.data;

  await prisma.consultant.update({
    where: { id: user.consultantId },
    data: {
      title: d.title || null,
      bio: d.bio || null,
      interests: d.interests || null,
      developmentGoals: d.developmentGoals || null,
      phone: d.phone || null,
      linkedin: d.linkedin || null,
      ...(d.status ? { status: d.status } : {}),
      ...(d.wantsNewAssignment !== undefined ? { wantsNewAssignment: d.wantsNewAssignment } : {}),
      skills: safeArrayJson(d.skills),
      industryExpertise: safeArrayJson(d.industryExpertise),
      certifications: safeArrayJson(d.certifications),
      languages: safeArrayJson(d.languages),
    },
  });

  revalidatePath('/my/profile');
  revalidatePath('/my');
  return { ok: true };
}
