import 'server-only';
import prisma from '@/lib/prisma';
import { generateWithGemini } from '@/lib/ai/providers/gemini';
import { generateWithClaude } from '@/lib/ai/providers/vertex-claude';
import { calculateCostUSD } from '@/lib/ai/pricing';

export const PIPELINE_STEPS = {
  EMAIL_EXTRACTION: 'EMAIL_EXTRACTION',
  MATCHING: 'MATCHING',
  CV_GENERATION: 'CV_GENERATION',
  CV_PARSING: 'CV_PARSING',
};

export async function generateWithModel({ modelId, messages, temperature, maxTokens }) {
  const model = await prisma.modelRegistry.findUnique({ where: { modelId } });
  if (!model) throw new Error(`Unknown modelId: ${modelId}`);
  if (!model.enabled) throw new Error(`Model ${modelId} is disabled`);

  let result;
  if (model.provider === 'ANTHROPIC') {
    result = await generateWithClaude({ modelId: model.modelId, messages, temperature, maxTokens });
  } else if (model.provider === 'GOOGLE') {
    result = await generateWithGemini({ modelId: model.modelId, messages, temperature, maxTokens });
  } else {
    throw new Error(`Unsupported provider: ${model.provider}`);
  }

  const estimatedCostUSD = calculateCostUSD({
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    inputPricePerMTok: model.inputPricePerMTok,
    outputPricePerMTok: model.outputPricePerMTok,
  });

  return { ...result, modelId: model.modelId, provider: model.provider, estimatedCostUSD };
}
