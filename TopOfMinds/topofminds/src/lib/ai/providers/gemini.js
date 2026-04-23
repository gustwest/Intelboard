import 'server-only';

/**
 * Google Gemini API provider (generativelanguage.googleapis.com)
 * Uses API key authentication — simpler and works globally without region constraints.
 * Falls back to Vertex AI if no API key is set.
 */

function buildContents(messages) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
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

export async function generateWithGemini({ modelId, messages, temperature, maxTokens, timeoutMs = 120_000 }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text();
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
