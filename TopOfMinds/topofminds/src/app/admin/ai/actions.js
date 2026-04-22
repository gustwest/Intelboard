'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import { z } from 'zod';

const UpdateSettingSchema = z.object({
  pipelineStep: z.string().min(1),
  championModelId: z.string().min(1),
  challengerModelId: z.string().optional().nullable(),
  shadowSampleRate: z.coerce.number().int().min(0).max(100),
  temperature: z.coerce.number().min(0).max(2).optional().nullable(),
  maxTokens: z.coerce.number().int().min(1).max(200000).optional().nullable(),
  systemPrompt: z.string().optional().nullable(),
});

export async function updateAISetting(_prev, formData) {
  const admin = await requireAdmin();

  const parsed = UpdateSettingSchema.safeParse({
    pipelineStep: formData.get('pipelineStep'),
    championModelId: formData.get('championModelId'),
    challengerModelId: formData.get('challengerModelId') || null,
    shadowSampleRate: formData.get('shadowSampleRate') || '0',
    temperature: formData.get('temperature') || null,
    maxTokens: formData.get('maxTokens') || null,
    systemPrompt: formData.get('systemPrompt') || null,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // Empty string challenger means "no challenger"
  const challengerModelId = data.challengerModelId && data.challengerModelId !== ''
    ? data.challengerModelId
    : null;

  await prisma.aISetting.upsert({
    where: { pipelineStep: data.pipelineStep },
    create: {
      pipelineStep: data.pipelineStep,
      championModelId: data.championModelId,
      challengerModelId,
      shadowSampleRate: challengerModelId ? data.shadowSampleRate : 0,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      systemPrompt: data.systemPrompt || null,
      updatedBy: admin.id,
    },
    update: {
      championModelId: data.championModelId,
      challengerModelId,
      shadowSampleRate: challengerModelId ? data.shadowSampleRate : 0,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      systemPrompt: data.systemPrompt || null,
      updatedBy: admin.id,
    },
  });

  revalidatePath('/admin/ai');
  return { ok: true };
}

export async function toggleModelEnabled(_prev, formData) {
  await requireAdmin();
  const modelId = formData.get('modelId');
  const enabled = formData.get('enabled') === 'true';
  if (!modelId) return { ok: false };

  await prisma.modelRegistry.update({
    where: { modelId: String(modelId) },
    data: { enabled },
  });
  revalidatePath('/admin/ai');
  return { ok: true };
}
