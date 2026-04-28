/**
 * BeachVibes API Client
 * Handles all HTTP requests to the BeachVibes backend with JWT auth.
 */

import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://dvoucher-app-815335042776.europe-north1.run.app';

const TOKEN_KEY = 'beachvibes_jwt';
const USER_KEY = 'beachvibes_user';

export interface BeachVibesUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role?: string;
}

// ─── Token management ────────────────────────────────

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getStoredUser(): Promise<BeachVibesUser | null> {
  try {
    const json = await SecureStore.getItemAsync(USER_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: BeachVibesUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

// ─── HTTP Client ─────────────────────────────────────

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers: extraHeaders = {}, skipAuth = false } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extraHeaders,
  };

  if (!skipAuth) {
    const token = await getToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // Token expired or invalid — clear and let the app redirect to login
    await clearToken();
    throw new Error('UNAUTHORIZED');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text) as T;
}

// ─── Convenience methods ─────────────────────────────

export const api = {
  get: <T = unknown>(path: string) => apiRequest<T>(path),
  post: <T = unknown>(path: string, body: Record<string, unknown>) =>
    apiRequest<T>(path, { method: 'POST', body }),
  put: <T = unknown>(path: string, body: Record<string, unknown>) =>
    apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T = unknown>(path: string, body: Record<string, unknown>) =>
    apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T = unknown>(path: string) =>
    apiRequest<T>(path, { method: 'DELETE' }),
};
