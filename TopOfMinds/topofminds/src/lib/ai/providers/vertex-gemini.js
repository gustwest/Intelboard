import 'server-only';
import { getAccessToken, getVertexConfig, getVertexBaseUrl } from '@/lib/ai/vertex-auth';

function buildContents(messages) {
  // Gemini expects: contents: [{ role: 'user'|'model', parts: [{text}] }]
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue; // handled via systemInstruction
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  return contents;
}

function buildSystemInstruction(messages) {
  const system = messages.find((m) => m.role === 'system');
  if (!system) return undefined;
  return { parts: [{ text: system.content }] };
}

export async function generateWithGemini({ modelId, messages, temperature, maxTokens, timeoutMs = 60_000 }) {
  const { project, location } = getVertexConfig();
  const token = await getAccessToken();

  const endpoint =
    `${getVertexBaseUrl(location)}/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${modelId}:generateContent`;

  const body = {
    contents: buildContents(messages),
    systemInstruction: buildSystemInstruction(messages),
    generationConfig: {
      ...(temperature != null ? { temperature } : {}),
      ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[vertex-gemini] HTTP ${res.status} endpoint=${endpoint.replace(/\/projects\/[^/]+/, '/projects/REDACTED')} body=${errText.slice(0, 500)}`);
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 500)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    const usage = data?.usageMetadata || {};
    return {
      text,
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      latencyMs,
      raw: data,
    };
  } finally {
    clearTimeout(timeout);
  }
}
