/**
 * Agent Task Store — Simple JSON-file-backed storage for agent tasks.
 * No Prisma/DB needed — perfect for projects without a database in the frontend.
 *
 * Data persists across restarts via a JSON file in /tmp.
 * In-memory cache for fast reads.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

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

interface StoreData {
  sessions: AgentSession[];
  lastPoll?: string;
  agentModel?: string;
  agentVersion?: string;
  agentProject?: string;
}

// ── Storage ──────────────────────────────────────────────────────

const DATA_DIR = process.env.AGENT_DATA_DIR || '/tmp/insiders-agent';
const DATA_FILE = join(DATA_DIR, 'agent-store.json');

let cache: StoreData | null = null;

async function load(): Promise<StoreData> {
  if (cache) return cache;
  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    cache = JSON.parse(raw);
    return cache!;
  } catch {
    cache = { sessions: [] };
    return cache;
  }
}

async function save(data: StoreData): Promise<void> {
  cache = data;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save agent store:', e);
  }
}

// ── Public API ───────────────────────────────────────────────────

export async function getSessions(): Promise<AgentSession[]> {
  const data = await load();
  return data.sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getSession(id: string): Promise<AgentSession | undefined> {
  const data = await load();
  return data.sessions.find((s) => s.id === id);
}

export async function createTask(prompt: string, sessionId?: string, model?: string): Promise<{ session: AgentSession; task: AgentTask }> {
  const data = await load();
  const now = new Date().toISOString();
  const taskId = randomUUID();
  const taskModel = model || 'claude-sonnet-4-6';

  const task: AgentTask = {
    id: taskId,
    prompt,
    status: 'PENDING',
    model: taskModel,
    response: null,
    error: null,
    sessionId: '',
    claudeSessionId: null,
    createdAt: now,
    updatedAt: now,
    logs: [],
  };

  let session: AgentSession;

  if (sessionId) {
    session = data.sessions.find((s) => s.id === sessionId)!;
    if (!session) {
      throw new Error('Session not found');
    }
    task.sessionId = session.id;
    session.tasks.push(task);
    session.updatedAt = now;
  } else {
    const sid = randomUUID();
    // Auto-generate title from first few words
    const title = prompt.length > 50 ? prompt.substring(0, 50) + '…' : prompt;
    session = {
      id: sid,
      title,
      pinned: false,
      claudeSessionId: null,
      createdAt: now,
      updatedAt: now,
      tasks: [task],
    };
    task.sessionId = sid;
    data.sessions.unshift(session);
  }

  await save(data);
  return { session, task };
}

export async function getNextPendingTask(): Promise<AgentTask | null> {
  const data = await load();
  for (const session of data.sessions) {
    for (const task of session.tasks) {
      if (task.status === 'PENDING') {
        return task;
      }
    }
  }
  return null;
}

export async function updateTask(
  taskId: string,
  updates: {
    status?: AgentTask['status'];
    response?: string;
    error?: string;
    claudeSessionId?: string;
    logs?: string[];
  }
): Promise<AgentTask | null> {
  const data = await load();
  const now = new Date().toISOString();

  for (const session of data.sessions) {
    const task = session.tasks.find((t) => t.id === taskId);
    if (task) {
      if (updates.status) task.status = updates.status;
      if (updates.response !== undefined) task.response = updates.response;
      if (updates.error) task.error = updates.error;
      task.updatedAt = now;
      session.updatedAt = now;

      if (updates.claudeSessionId) {
        task.claudeSessionId = updates.claudeSessionId;
        session.claudeSessionId = updates.claudeSessionId;
      }

      if (updates.logs) {
        for (const msg of updates.logs) {
          task.logs.push({
            id: randomUUID(),
            message: msg,
            createdAt: now,
          });
        }
      }

      await save(data);
      return task;
    }
  }
  return null;
}

export async function patchSession(
  sessionId: string,
  updates: { title?: string; pinned?: boolean }
): Promise<AgentSession | null> {
  const data = await load();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  if (updates.title !== undefined) session.title = updates.title;
  if (updates.pinned !== undefined) session.pinned = updates.pinned;
  session.updatedAt = new Date().toISOString();

  await save(data);
  return session;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const data = await load();
  const idx = data.sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return false;
  data.sessions.splice(idx, 1);
  await save(data);
  return true;
}

export async function recordPoll(meta?: {
  model?: string;
  version?: string;
  project?: string;
}): Promise<void> {
  const data = await load();
  data.lastPoll = new Date().toISOString();
  if (meta?.model) data.agentModel = meta.model;
  if (meta?.version) data.agentVersion = meta.version;
  if (meta?.project) data.agentProject = meta.project;
  await save(data);
}

export async function getStatus(): Promise<{
  online: boolean;
  lastPoll?: string;
  model?: string;
  cliVersion?: string;
  projectDir?: string;
  stats: { total: number; completed: number; failed: number; successRate: number };
}> {
  const data = await load();

  const allTasks = data.sessions.flatMap((s) => s.tasks);
  const total = allTasks.length;
  const completed = allTasks.filter((t) => t.status === 'DONE').length;
  const failed = allTasks.filter((t) => t.status === 'FAILED').length;

  const online = data.lastPoll
    ? Date.now() - new Date(data.lastPoll).getTime() < 30000
    : false;

  return {
    online,
    lastPoll: data.lastPoll,
    model: data.agentModel,
    cliVersion: data.agentVersion,
    projectDir: data.agentProject,
    stats: {
      total,
      completed,
      failed,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
  };
}
