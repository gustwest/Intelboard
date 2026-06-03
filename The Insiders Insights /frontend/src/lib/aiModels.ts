/**
 * Spegelbild av `insider-graph-api/services/model_registry.py` för frontend.
 *
 * Källan av sanning är Python-registret. Den här filen finns för att UI-kod (prose
 * i arkitektur-sidan, dropdowns i admin-arbetsytan) ska kunna referera till modell-
 * ID via en namngiven konstant istället för att hårdkoda strängen i tio filer.
 *
 * POLICY: alltid senaste stabla modellen i varje provider/roll — inga `pinnedReason`.
 * När Python-registret uppdateras → uppdatera den här filen MANUELLT i samma commit.
 *
 * Synkkrav:
 *   - `services/model_registry.py` och denna fil måste hållas i lockstep.
 *   - `jobs/model_drift_scan` har `frontend/src/lib/aiModels.ts` i sin skip-lista,
 *     men greppar hela frontend/src i övrigt. Om någon hårdkodar ett model-ID i
 *     en annan frontend-fil flaggas det som `unauthorized_hardcode` i inboxen.
 */

export type ModelProvider =
  | "vertex_gemini"
  | "vertex_anthropic"
  | "vertex_mistral"
  | "openai"
  | "perplexity"
  | "google_genai"
  | "google_genai_vertex"
  | "claude_code_cli";

/** Driver UI-grupperingen i AI-synlighet. Aldrig medeltala över olika source-typer. */
export type KnowledgeSource = "training" | "web_rag" | "hybrid";

export interface ModelEntry {
  role: string;
  modelId: string;
  provider: ModelProvider;
  purpose: string;
  latestKnown: string;
  checkedAt: string; // ISO YYYY-MM-DD
  effectiveSince: string; // ISO YYYY-MM-DD — brytlinje i tidsserier vid modellbyte
  vertexLocation?: string; // "global" / "europe-west1" / etc — endast Vertex-providers
  knowledgeSource?: KnowledgeSource; // default "training"
}

const _CHECKED = "2026-06-02";
const _EFFECTIVE = "2026-06-02";

export const MODEL_REGISTRY: readonly ModelEntry[] = [
  {
    role: "geo_generator",
    // 2026-06-03: rollback från 3.5-flash (404 överallt) → 2.5-flash. Speglar backend.
    modelId: "gemini-2.5-flash",
    provider: "vertex_gemini",
    purpose: "Generering + relevansgrindning för claims-pipelinen",
    latestKnown: "gemini-2.5-flash",
    checkedAt: "2026-06-03",
    effectiveSince: "2026-06-03",
  },
  {
    role: "geo_validator",
    modelId: "gemini-2.5-pro",
    provider: "vertex_gemini",
    purpose:
      "Precisionskritisk validator i claims-pipelinen (senaste stabla pro; 3.x-pro är fortfarande preview)",
    latestKnown: "gemini-2.5-pro",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
  },
  {
    role: "esg_reasoner",
    modelId: "gemini-2.5-pro",
    provider: "vertex_gemini",
    purpose: "ESG-frågegenerering + svarsklassning",
    latestKnown: "gemini-2.5-pro",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
  },
  {
    role: "probe_claude",
    modelId: "claude-sonnet-4-6",
    provider: "vertex_anthropic",
    purpose: "Claude-probe i polling + risk_detector (Vertex Model Garden, global)",
    latestKnown: "claude-sonnet-4-6",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
    vertexLocation: "global",
  },
  {
    role: "probe_gemini",
    modelId: "gemini-2.5-pro",
    provider: "vertex_gemini",
    purpose: "Gemini-probe i polling + risk_detector (Vertex AI EU)",
    latestKnown: "gemini-2.5-pro",
    checkedAt: _CHECKED,
    effectiveSince: "2026-06-03",
    vertexLocation: "europe-west1",
  },
  {
    role: "probe_openai",
    // 2026-06-03: rollback gpt-5.5 → gpt-4.1 (5.5 krävde max_completion_tokens + rate-limited).
    modelId: "gpt-4.1",
    provider: "openai",
    purpose: "ChatGPT-probe i polling + risk_detector (OpenAI direkt — finns inte i Vertex)",
    latestKnown: "gpt-4.1",
    checkedAt: "2026-06-03",
    effectiveSince: "2026-06-03",
  },
  {
    role: "probe_mistral",
    modelId: "mistral-medium-3",
    provider: "vertex_mistral",
    purpose: "Mistral Le Chat-probe (Vertex MaaS, OpenAI-kompatibel endpoint, EU)",
    latestKnown: "mistral-medium-3",
    checkedAt: _CHECKED,
    effectiveSince: "2026-06-03",
    vertexLocation: "europe-west4",
  },
  {
    role: "probe_perplexity",
    modelId: "sonar",
    provider: "perplexity",
    purpose: "Perplexity-probe (Sonar, web-RAG) — mäter AI-discoverability live på webben",
    latestKnown: "sonar",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
    knowledgeSource: "web_rag",
  },
  {
    role: "email_extractor_openai",
    // 2026-06-03: rollback gpt-5.5 → gpt-4.1 (samma skäl som probe_openai).
    modelId: "gpt-4.1",
    provider: "openai",
    purpose: "Strukturera fritext-mail till Schema.org Event (primär)",
    latestKnown: "gpt-4.1",
    checkedAt: "2026-06-03",
    effectiveSince: "2026-06-03",
  },
  {
    role: "email_extractor_gemini",
    // 2026-06-03: rollback från 3.5-flash → 2.5-flash. Speglar backend.
    modelId: "gemini-2.5-flash",
    provider: "google_genai",
    purpose: "Strukturera fritext-mail till Schema.org Event (fallback)",
    latestKnown: "gemini-2.5-flash",
    checkedAt: "2026-06-03",
    effectiveSince: "2026-06-03",
  },
  {
    role: "agent_default",
    modelId: "claude-opus-4-8",
    provider: "claude_code_cli",
    purpose: "Default-modell för admin-agenten",
    latestKnown: "claude-opus-4-8",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
  },
  {
    role: "agent_sonnet",
    modelId: "claude-sonnet-4-6",
    provider: "claude_code_cli",
    purpose: "Sonnet-alternativ i admin-dropdown (snabbare/billigare)",
    latestKnown: "claude-sonnet-4-6",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
  },
  {
    role: "agent_haiku",
    modelId: "claude-haiku-4-5-20251001",
    provider: "claude_code_cli",
    purpose: "Haiku-alternativ i admin-dropdown (lägst latens)",
    latestKnown: "claude-haiku-4-5-20251001",
    checkedAt: _CHECKED,
    effectiveSince: _EFFECTIVE,
  },
  {
    role: "dataset_summarizer",
    // 2026-06-03: rollback från 3.5-flash → 2.5-flash. Speglar backend.
    modelId: "gemini-2.5-flash",
    provider: "google_genai_vertex",
    purpose: "Skriver kort sammanfattning vid nytt dataset",
    latestKnown: "gemini-2.5-flash",
    checkedAt: "2026-06-03",
    effectiveSince: "2026-06-03",
  },
] as const;

const BY_ROLE = new Map(MODEL_REGISTRY.map((e) => [e.role, e]));

/** Slå upp en entry; kastar om rollen saknas (typo-skydd). */
export function modelEntry(role: string): ModelEntry {
  const e = BY_ROLE.get(role);
  if (!e) throw new Error(`Okänd modell-roll: ${role}`);
  return e;
}

/** Kort: bara model_id. Använd där prose vill visa "gemini-3.5-flash". */
export function modelId(role: string): string {
  return modelEntry(role).modelId;
}

// --- Namngivna konstanter för vanliga konsumenter --------------------------

export const GEO_GENERATOR_MODEL = modelId("geo_generator");
export const GEO_VALIDATOR_MODEL = modelId("geo_validator");
export const ESG_REASONER_MODEL = modelId("esg_reasoner");
export const PROBE_CLAUDE_MODEL = modelId("probe_claude");
export const PROBE_GEMINI_MODEL = modelId("probe_gemini");
export const PROBE_OPENAI_MODEL = modelId("probe_openai");
export const PROBE_MISTRAL_MODEL = modelId("probe_mistral");
export const PROBE_PERPLEXITY_MODEL = modelId("probe_perplexity");

// --- UI-gruppering (RLHF vs RAG) -----------------------------------------
// Hjälpare för AI-synlighet-fliken att rendera probarna i två separata sektioner:
// "Bas-kunskap" (training) vs "Live-signal" (web_rag). Aldrig medeltala över dessa.

export const TRAINING_PROBE_ROLES = MODEL_REGISTRY
  .filter((e) => e.role.startsWith("probe_") && (e.knowledgeSource ?? "training") === "training")
  .map((e) => e.role);

export const WEB_RAG_PROBE_ROLES = MODEL_REGISTRY
  .filter((e) => e.role.startsWith("probe_") && e.knowledgeSource === "web_rag")
  .map((e) => e.role);

// --- Admin-agentens dropdown ---------------------------------------------

export interface AgentDropdownOption {
  value: string; // model_id som skickas till backend
  label: string; // det användaren ser
  role: string;
}

export const AGENT_DROPDOWN_OPTIONS: readonly AgentDropdownOption[] = [
  { role: "agent_sonnet", value: modelId("agent_sonnet"), label: "Sonnet 4.6" },
  { role: "agent_default", value: modelId("agent_default"), label: "Opus 4.8" },
  { role: "agent_haiku", value: modelId("agent_haiku"), label: "Haiku 4.5" },
] as const;

export const AGENT_DEFAULT_MODEL_ID = modelId("agent_default");
