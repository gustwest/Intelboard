/**
 * Agent Task Store — thin proxy to the backend.
 *
 * State lives on the backend (a JSON file in /app/data/agent_sessions.json),
 * not in the frontend. Cloud Run runs multiple frontend instances that don't
 * share /tmp, so any local cache here would lose sessions when traffic
 * landed on a different instance. The backend is the single source of truth.
 */

// ── Types ────────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  prompt: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  model: string;
  response?: string | null;
  error?: string | null;
  sessionId: string;
  claudeSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
  logs: AgentLog[];
}

export interface AgentSession {
  id: string;
  title: string;
  pinned: boolean;
  claudeSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: AgentTask[];
}

export interface AgentLog {
  id: string;
  message: string;
  createdAt: string;
}

// ── Backend client ───────────────────────────────────────────────

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';

const AGENT_API_KEY = process.env.AGENT_API_KEY || '';

function authHeaders(): Record<string, string> {
  return AGENT_API_KEY ? { Authorization: `Bearer ${AGENT_API_KEY}` } : {};
}

async function backend<T>(
  path: string,
  init?: RequestInit & { auth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (init?.auth) Object.assign(headers, authHeaders());

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Backend ${init?.method || 'GET'} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────

export async function getSessions(): Promise<AgentSession[]> {
  return backend<AgentSession[]>('/api/agent/sessions');
}

export async function getSession(id: string): Promise<AgentSession | undefined> {
  try {
    return await backend<AgentSession>(`/api/agent/sessions/${id}`);
  } catch {
    return undefined;
  }
}

export async function createTask(
  prompt: string,
  sessionId?: string,
  model?: string,
): Promise<{ session: AgentSession; task: AgentTask }> {
  return backend<{ session: AgentSession; task: AgentTask }>(
    '/api/agent/tasks',
    {
      method: 'POST',
      body: JSON.stringify({ prompt, sessionId, model }),
    },
  );
}

export async function patchSession(
  sessionId: string,
  updates: { title?: string; pinned?: boolean },
): Promise<AgentSession | null> {
  try {
    return await backend<AgentSession>(`/api/agent/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  } catch {
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await backend(`/api/agent/sessions/${sessionId}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

export async function getStatus(): Promise<{
  online: boolean;
  lastPoll?: string;
  model?: string;
  cliVersion?: string;
  projectDir?: string;
  stats: { total: number; completed: number; failed: number; successRate: number };
}> {
  return backend('/api/agent/status');
}

// ── Poll endpoints (used only by /api/admin/agent/poll route) ────

export interface PollTask {
  id: string;
  prompt: string;
  model: string;
  sessionId: string;
  resumeSessionId: string | null;
}

export async function pollNextTask(meta: {
  model?: string;
  version?: string;
  project?: string;
}): Promise<{ task: PollTask | null; timestamp: string }> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (meta.model) headers['x-agent-model'] = meta.model;
  if (meta.version) headers['x-agent-version'] = meta.version;
  if (meta.project) headers['x-agent-project'] = meta.project;

  const res = await fetch(`${BACKEND_URL}/api/agent/poll`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Backend poll → ${res.status}`);
  return res.json();
}

export async function reportTaskUpdate(body: {
  taskId: string;
  status?: AgentTask['status'];
  response?: string;
  error?: string;
  logs?: string[];
  claudeSessionId?: string;
}): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/agent/poll`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Backend poll PATCH → ${res.status}`);
}
