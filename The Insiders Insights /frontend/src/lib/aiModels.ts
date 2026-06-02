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
  | "openai"
  | "google_genai"
  | "google_genai_vertex"
  | "vertex_anthropic"
  | "claude_code_cli";

export interface ModelEntry {
  role: string;
  modelId: string;
  provider: ModelProvider;
  purpose: string;
  latestKnown: string;
  checkedAt: string; // ISO YYYY-MM-DD
}

const _CHECKED = "2026-06-02";

export const MODEL_REGISTRY: readonly ModelEntry[] = [
  {
    role: "geo_generator",
    modelId: "gemini-3.5-flash",
    provider: "vertex_gemini",
    purpose: "Generering + relevansgrindning för claims-pipelinen",
    latestKnown: "gemini-3.5-flash",
    checkedAt: _CHECKED,
  },
  {
    role: "geo_validator",
    modelId: "gemini-2.5-pro",
    provider: "vertex_gemini",
    purpose:
      "Precisionskritisk validator i claims-pipelinen (senaste stabla pro; 3.x-pro är fortfarande preview)",
    latestKnown: "gemini-2.5-pro",
    checkedAt: _CHECKED,
  },
  {
    role: "esg_reasoner",
    modelId: "gemini-2.5-pro",
    provider: "vertex_gemini",
    purpose: "ESG-frågegenerering + svarsklassning",
    latestKnown: "gemini-2.5-pro",
    checkedAt: _CHECKED,
  },
  {
    role: "probe_claude",
    modelId: "claude-sonnet-4-5",
    provider: "vertex_anthropic",
    purpose: "Claude-probe i polling + risk_detector (Vertex Model Garden, EU)",
    latestKnown: "claude-sonnet-4-5",
    checkedAt: _CHECKED,
  },
  {
    role: "probe_gemini",
    modelId: "gemini-2.5-pro",
    provider: "vertex_gemini",
    purpose: "Gemini-probe i polling + risk_detector (Vertex AI EU)",
    latestKnown: "gemini-2.5-pro",
    checkedAt: _CHECKED,
  },
  {
    role: "email_extractor_openai",
    modelId: "gpt-5.5",
    provider: "openai",
    purpose: "Strukturera fritext-mail till Schema.org Event (primär)",
    latestKnown: "gpt-5.5",
    checkedAt: _CHECKED,
  },
  {
    role: "email_extractor_gemini",
    modelId: "gemini-3.5-flash",
    provider: "google_genai",
    purpose: "Strukturera fritext-mail till Schema.org Event (fallback)",
    latestKnown: "gemini-3.5-flash",
    checkedAt: _CHECKED,
  },
  {
    role: "agent_default",
    modelId: "claude-opus-4-8",
    provider: "claude_code_cli",
    purpose: "Default-modell för admin-agenten",
    latestKnown: "claude-opus-4-8",
    checkedAt: _CHECKED,
  },
  {
    role: "agent_sonnet",
    modelId: "claude-sonnet-4-6",
    provider: "claude_code_cli",
    purpose: "Sonnet-alternativ i admin-dropdown (snabbare/billigare)",
    latestKnown: "claude-sonnet-4-6",
    checkedAt: _CHECKED,
  },
  {
    role: "agent_haiku",
    modelId: "claude-haiku-4-5-20251001",
    provider: "claude_code_cli",
    purpose: "Haiku-alternativ i admin-dropdown (lägst latens)",
    latestKnown: "claude-haiku-4-5-20251001",
    checkedAt: _CHECKED,
  },
  {
    role: "dataset_summarizer",
    modelId: "gemini-3.5-flash",
    provider: "google_genai_vertex",
    purpose: "Skriver kort sammanfattning vid nytt dataset",
    latestKnown: "gemini-3.5-flash",
    checkedAt: _CHECKED,
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
