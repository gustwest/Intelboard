import 'server-only';
import { getAccessToken, getVertexConfig, getVertexBaseUrl } from '@/lib/ai/vertex-auth';

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2_000;

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

export async function generateWithGemini({ modelId, messages, temperature, maxTokens, timeoutMs = 90_000 }) {
  const { project, location } = getVertexConfig();

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

  let attempt = 0;
  const start = Date.now();

  while (true) {
    const token = await getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      clearTimeout(timeout);

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        const delay = retryAfter ? retryAfter * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
        attempt++;
        console.warn(`[vertex-gemini] 429 rate limit — retry ${attempt}/${MAX_RETRIES} after ${delay}ms modelId=${modelId}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[vertex-gemini] HTTP ${res.status} endpoint=${endpoint.replace(/\/projects\/[^/]+/, '/projects/REDACTED')} body=${errText.slice(0, 500)}`);
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 500)}`);
      }

      const latencyMs = Date.now() - start;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        ?.map((p) => p.text)
        .join('') ?? '';
      const usage = data?.usageMetadata || {};
      return {
        text,
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        latencyMs,
        raw: data,
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}
