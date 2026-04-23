import 'server-only';
import { getAccessToken, getVertexConfig, getVertexBaseUrl } from '@/lib/ai/vertex-auth';

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2_000;

export async function generateWithClaude({ modelId, messages, temperature, maxTokens, timeoutMs = 90_000 }) {
  const { project, location } = getVertexConfig();

  const endpoint =
    `${getVertexBaseUrl(location)}/v1/projects/${project}` +
    `/locations/${location}/publishers/anthropic/models/${modelId}:rawPredict`;

  const systemMessage = messages.find((m) => m.role === 'system');
  const conversation = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const body = {
    anthropic_version: 'vertex-2023-10-16',
    messages: conversation,
    ...(systemMessage ? { system: systemMessage.content } : {}),
    ...(maxTokens != null ? { max_tokens: maxTokens } : { max_tokens: 2048 }),
    ...(temperature != null ? { temperature } : {}),
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
        console.warn(`[vertex-claude] 429 rate limit — retry ${attempt}/${MAX_RETRIES} after ${delay}ms modelId=${modelId}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[vertex-claude] HTTP ${res.status} endpoint=${endpoint.replace(/\/projects\/[^/]+/, '/projects/REDACTED')} body=${errText.slice(0, 500)}`);
        throw new Error(`Claude API error (${res.status}): ${errText.slice(0, 500)}`);
      }

      const latencyMs = Date.now() - start;
      const data = await res.json();
      const text = (data?.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
      const usage = data?.usage || {};
      return {
        text,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        latencyMs,
        raw: data,
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}
