'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/dal';
import prisma from '@/lib/prisma';
import { intakeAssignmentFromEmail } from '@/lib/assignments/intake';
import { runMatchingForAssignment } from '@/lib/assignments/matching';
import { generateTailoredCv } from '@/lib/assignments/cv';

export async function intakeAssignmentAction(_prev, formData) {
  const admin = await requireAdmin();
  const emailBody = String(formData.get('emailBody') || '').trim();
  const emailSubject = String(formData.get('emailSubject') || '').trim() || null;

  if (!emailBody) {
    return { ok: false, message: 'E-postinnehåll krävs.' };
  }

  try {
    const { assignment } = await intakeAssignmentFromEmail({
      emailBody,
      emailSubject,
      sourceType: 'MANUAL',
      userId: admin.id,
    });
    revalidatePath('/assignments');
    redirect(`/assignments/${assignment.id}`);
  } catch (error) {
    // redirect() throws — don't swallow it
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    return { ok: false, message: error?.message || 'Okänt fel vid extraktion.' };
  }
}

export async function triggerMatchingAction(assignmentId) {
  const admin = await requireAdmin();
  if (!assignmentId) return { ok: false, message: 'assignmentId krävs' };

  try {
    const result = await runMatchingForAssignment({ assignmentId, userId: admin.id });
    revalidatePath(`/assignments/${assignmentId}`);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: error?.message || 'Matchningen misslyckades' };
  }
}

export async function generateCvAction({ assignmentId, consultantId }) {
  const admin = await requireAdmin();
  if (!assignmentId || !consultantId) return { ok: false, message: 'assignmentId och consultantId krävs' };

  try {
    const { cvText, modelId, jobId } = await generateTailoredCv({
      assignmentId,
      consultantId,
      userId: admin.id,
    });

    await prisma.application.upsert({
      where: { assignmentId_consultantId: { assignmentId, consultantId } },
      create: {
        assignmentId,
        consultantId,
        status: 'DRAFT_CV',
        tailoredCv: cvText,
        createdByUserId: admin.id,
      },
      update: { tailoredCv: cvText, status: 'DRAFT_CV' },
    });

    revalidatePath(`/assignments/${assignmentId}`);
    return { ok: true, cvText, modelId, jobId };
  } catch (error) {
    return { ok: false, message: error?.message || 'CV-generering misslyckades' };
  }
}

export async function updateApplicationStatusAction({ applicationId, status }) {
  await requireAdmin();
  const allowed = ['INTERESTED', 'DRAFT_CV', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'WON'];
  if (!allowed.includes(status)) return { ok: false };

  const app = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status,
      ...(status === 'APPLIED' ? { appliedAt: new Date() } : {}),
    },
  });
  revalidatePath(`/assignments/${app.assignmentId}`);
  return { ok: true };
}
