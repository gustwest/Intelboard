import 'server-only';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { generateWithModel } from '@/lib/ai/provider';

async function logUsage({
  pipelineStep,
  modelId,
  role,
  jobId,
  assignmentId,
  consultantId,
  userId,
  inputTokens,
  outputTokens,
  estimatedCostUSD,
  latencyMs,
  status,
  errorMessage,
}) {
  try {
    await prisma.aIUsageLog.create({
      data: {
        pipelineStep,
        modelId,
        role,
        jobId,
        assignmentId,
        consultantId,
        userId,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        estimatedCostUSD: estimatedCostUSD || 0,
        latencyMs: latencyMs || 0,
        status,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 2000) : null,
      },
    });
  } catch (e) {
    // Don't let logging failures break the pipeline
    console.error('[AIUsageLog] failed to write:', e?.message);
  }
}

async function runSingle({ pipelineStep, modelId, role, messages, temperature, maxTokens, jobId, assignmentId, consultantId, userId }) {
  try {
    const result = await generateWithModel({ modelId, messages, temperature, maxTokens });
    await logUsage({
      pipelineStep,
      modelId,
      role,
      jobId,
      assignmentId,
      consultantId,
      userId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUSD: result.estimatedCostUSD,
      latencyMs: result.latencyMs,
      status: 'SUCCESS',
    });
    return { ok: true, result };
  } catch (error) {
    await logUsage({
      pipelineStep,
      modelId,
      role,
      jobId,
      assignmentId,
      consultantId,
      userId,
      status: 'ERROR',
      errorMessage: error?.message,
    });
    return { ok: false, error };
  }
}

export async function runPipelineStep({
  pipelineStep,
  messages,
  assignmentId,
  consultantId,
  userId,
  temperatureOverride,
  maxTokensOverride,
}) {
  const setting = await prisma.aISetting.findUnique({ where: { pipelineStep } });
  if (!setting) {
    throw new Error(`No AISetting configured for pipeline step ${pipelineStep}`);
  }

  const temperature = temperatureOverride ?? setting.temperature ?? undefined;
  const maxTokens = maxTokensOverride ?? setting.maxTokens ?? undefined;
  const jobId = randomUUID();

  // Prepend system prompt if configured and no system in messages already
  const finalMessages = setting.systemPrompt && !messages.some((m) => m.role === 'system')
    ? [{ role: 'system', content: setting.systemPrompt }, ...messages]
    : messages;

  const runChampion = () =>
    runSingle({
      pipelineStep,
      modelId: setting.championModelId,
      role: 'CHAMPION',
      messages: finalMessages,
      temperature,
      maxTokens,
      jobId,
      assignmentId,
      consultantId,
      userId,
    });

  const shouldShadow =
    setting.challengerModelId &&
    setting.shadowSampleRate > 0 &&
    Math.random() * 100 < setting.shadowSampleRate;

  if (!shouldShadow) {
    const { ok, result, error } = await runChampion();
    if (!ok) throw error;
    return { ...result, jobId, role: 'CHAMPION' };
  }

  // Run both champion and challenger in parallel
  const [champRes, challRes] = await Promise.all([
    runChampion(),
    runSingle({
      pipelineStep,
      modelId: setting.challengerModelId,
      role: 'CHALLENGER',
      messages: finalMessages,
      temperature,
      maxTokens,
      jobId,
      assignmentId,
      consultantId,
      userId,
    }),
  ]);

  // Persist shadow results for side-by-side comparison
  try {
    await prisma.aIShadowResult.createMany({
      data: [
        champRes.ok && {
          jobId,
          pipelineStep,
          modelId: setting.championModelId,
          role: 'CHAMPION',
          output: champRes.result.text,
          inputTokens: champRes.result.inputTokens,
          outputTokens: champRes.result.outputTokens,
          latencyMs: champRes.result.latencyMs,
        },
        challRes.ok && {
          jobId,
          pipelineStep,
          modelId: setting.challengerModelId,
          role: 'CHALLENGER',
          output: challRes.result.text,
          inputTokens: challRes.result.inputTokens,
          outputTokens: challRes.result.outputTokens,
          latencyMs: challRes.result.latencyMs,
        },
      ].filter(Boolean),
    });
  } catch (e) {
    console.error('[AIShadowResult] failed to write:', e?.message);
  }

  if (!champRes.ok) {
    // Fall back to challenger result if champion errored
    if (challRes.ok) return { ...challRes.result, jobId, role: 'CHALLENGER', fallback: true };
    throw champRes.error;
  }
  return { ...champRes.result, jobId, role: 'CHAMPION' };
}
