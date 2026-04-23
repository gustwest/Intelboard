import 'server-only';
import { getAccessToken, getVertexConfig, getVertexBaseUrl } from '@/lib/ai/vertex-auth';

export async function generateWithClaude({ modelId, messages, temperature, maxTokens, timeoutMs = 60_000 }) {
  const { project, location } = getVertexConfig();
  const token = await getAccessToken();

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
      console.error(`[vertex-claude] HTTP ${res.status} endpoint=${endpoint.replace(/\/projects\/[^/]+/, '/projects/REDACTED')} body=${errText.slice(0, 500)}`);
      throw new Error(`Claude API error (${res.status}): ${errText.slice(0, 500)}`);
    }

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
  } finally {
    clearTimeout(timeout);
  }
}
