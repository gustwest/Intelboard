/**
 * Robustly extract a JSON object from an LLM's text response.
 * Handles: raw JSON, ```json fenced blocks, text with leading/trailing prose.
 */
export function parseJsonFromResponse(text) {
  if (!text) throw new Error('Empty model response');

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }

  // Find first { ... last } balance
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error(`Could not parse JSON from model response. Preview: ${text.slice(0, 200)}`);
}
