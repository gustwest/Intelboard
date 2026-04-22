/**
 * Seeds ModelRegistry, default AISetting rows, and an initial admin user.
 * Designed to be idempotent (upserts) so it's safe to re-run.
 */

const bcrypt = require('bcryptjs');

// Snapshot of Vertex AI models available as of April 2026.
// Prices are USD per million tokens. Keep updated; admin UI shows a "last verified" flag.
const MODEL_REGISTRY = [
  // Anthropic
  { modelId: 'claude-opus-4-7', provider: 'ANTHROPIC', displayName: 'Claude Opus 4.7', category: 'FRONTIER', inputPricePerMTok: 15, outputPricePerMTok: 75, contextWindow: 1_000_000, capabilities: { vision: true, tools: true, thinking: true }, notes: 'Most capable Opus model; 1M context on Vertex.' },
  { modelId: 'claude-opus-4-6', provider: 'ANTHROPIC', displayName: 'Claude Opus 4.6', category: 'FRONTIER', inputPricePerMTok: 15, outputPricePerMTok: 75, contextWindow: 1_000_000, capabilities: { vision: true, tools: true, thinking: true } },
  { modelId: 'claude-sonnet-4-6', provider: 'ANTHROPIC', displayName: 'Claude Sonnet 4.6', category: 'FRONTIER', inputPricePerMTok: 3, outputPricePerMTok: 15, contextWindow: 1_000_000, capabilities: { vision: true, tools: true }, notes: 'Frontier intelligence at lower cost; 1M context.' },
  { modelId: 'claude-sonnet-4-5', provider: 'ANTHROPIC', displayName: 'Claude Sonnet 4.5', category: 'BALANCED', inputPricePerMTok: 3, outputPricePerMTok: 15, contextWindow: 200_000, capabilities: { vision: true, tools: true } },
  { modelId: 'claude-haiku-4-5', provider: 'ANTHROPIC', displayName: 'Claude Haiku 4.5', category: 'FAST', inputPricePerMTok: 0.8, outputPricePerMTok: 4, contextWindow: 200_000, capabilities: { vision: true, tools: true }, notes: 'Near-frontier performance, fast and cheap.' },

  // Google
  { modelId: 'gemini-3-flash', provider: 'GOOGLE', displayName: 'Gemini 3 Flash', category: 'BALANCED', inputPricePerMTok: 0.3, outputPricePerMTok: 2.5, contextWindow: 1_000_000, capabilities: { vision: true, tools: true, thinking: true }, notes: 'Preview. Dynamic thinking with MINIMAL/MEDIUM levels.' },
  { modelId: 'gemini-3-1-pro', provider: 'GOOGLE', displayName: 'Gemini 3.1 Pro', category: 'FRONTIER', inputPricePerMTok: 1.25, outputPricePerMTok: 10, contextWindow: 1_000_000, capabilities: { vision: true, tools: true, thinking: true }, notes: 'Preview. Reasoning-first, adaptive thinking, integrated grounding.' },
  { modelId: 'gemini-3-1-flash-lite', provider: 'GOOGLE', displayName: 'Gemini 3.1 Flash-Lite', category: 'FAST', inputPricePerMTok: 0.075, outputPricePerMTok: 0.3, contextWindow: 1_000_000, capabilities: { vision: true }, notes: 'Most cost-efficient; high-volume low-latency traffic.' },
  { modelId: 'gemini-2-5-flash', provider: 'GOOGLE', displayName: 'Gemini 2.5 Flash', category: 'FAST', inputPricePerMTok: 0.15, outputPricePerMTok: 0.6, contextWindow: 1_000_000, capabilities: { vision: true, tools: true }, notes: 'GA; stable production model.' },
];

// Default pipeline settings — Haiku for high-volume steps, Sonnet for CV generation
const DEFAULT_AI_SETTINGS = [
  { pipelineStep: 'EMAIL_EXTRACTION', championModelId: 'claude-haiku-4-5', temperature: 0.1, maxTokens: 2048 },
  { pipelineStep: 'MATCHING', championModelId: 'claude-haiku-4-5', temperature: 0.2, maxTokens: 1500 },
  { pipelineStep: 'CV_GENERATION', championModelId: 'claude-sonnet-4-6', temperature: 0.5, maxTokens: 4096 },
  { pipelineStep: 'CV_PARSING', championModelId: 'claude-haiku-4-5', temperature: 0.1, maxTokens: 3000 },
];

async function seedModelRegistry(prisma) {
  console.log('🤖 Seeding ModelRegistry…');
  for (const m of MODEL_REGISTRY) {
    await prisma.modelRegistry.upsert({
      where: { modelId: m.modelId },
      create: {
        modelId: m.modelId,
        provider: m.provider,
        displayName: m.displayName,
        category: m.category,
        inputPricePerMTok: m.inputPricePerMTok,
        outputPricePerMTok: m.outputPricePerMTok,
        contextWindow: m.contextWindow,
        capabilities: m.capabilities ? JSON.stringify(m.capabilities) : null,
        notes: m.notes || null,
        lastVerifiedAt: new Date(),
      },
      update: {
        displayName: m.displayName,
        category: m.category,
        inputPricePerMTok: m.inputPricePerMTok,
        outputPricePerMTok: m.outputPricePerMTok,
        contextWindow: m.contextWindow,
        capabilities: m.capabilities ? JSON.stringify(m.capabilities) : null,
        notes: m.notes || null,
        lastVerifiedAt: new Date(),
      },
    });
  }
  console.log(`   ${MODEL_REGISTRY.length} models upserted.`);
}

async function seedDefaultAISettings(prisma) {
  console.log('⚙️  Seeding default AI pipeline settings…');
  for (const s of DEFAULT_AI_SETTINGS) {
    await prisma.aISetting.upsert({
      where: { pipelineStep: s.pipelineStep },
      create: s,
      update: {}, // don't override admin changes on re-seed
    });
  }
  console.log(`   ${DEFAULT_AI_SETTINGS.length} pipeline steps configured.`);
}

async function seedInitialAdmin(prisma) {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@topofminds.se';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`👤 Admin user already exists (${adminEmail}), skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'Admin',
      passwordHash,
      role: 'SUPERADMIN',
    },
  });
  console.log(`👤 Created SUPERADMIN user: ${adminEmail} (password: ${adminPassword})`);
  console.log('   ⚠️  Change this password immediately after first login.');
}

module.exports = { seedModelRegistry, seedDefaultAISettings, seedInitialAdmin, MODEL_REGISTRY };
