/**
 * Robustly extract a JSON object from an LLM's text response.
 * Handles: raw JSON, ```json fenced blocks, text with leading/trailing prose,
 * thinking blocks, multiple code fences, etc.
 */
export function parseJsonFromResponse(text) {
  if (!text) throw new Error('Empty model response');

  // Try direct parse first (cleanest case)
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Strip markdown code fences — match LAST ```json block (in case of thinking output)
  const fenceMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = fenceMatches.length - 1; i >= 0; i--) {
    const candidate = fenceMatches[i][1].trim();
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      try {
        return JSON.parse(candidate);
      } catch {}
    }
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

  // Find first [ ... last ] balance (for array responses)
  const aStart = text.indexOf('[');
  const aEnd = text.lastIndexOf(']');
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    const candidate = text.slice(aStart, aEnd + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error(`Could not parse JSON from model response. Preview: ${text.slice(0, 200)}`);
}
