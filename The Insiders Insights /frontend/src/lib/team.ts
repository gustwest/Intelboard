/**
 * Team roster — single source of truth for allowed emails, roles, and chat colors.
 * Imported by auth.ts (signIn whitelist) and UserProvider (chat identities).
 */
export type TeamRole = 'SUPERADMIN' | 'ADMIN';

export interface TeamMember {
  email: string;
  role: TeamRole;
  color: string;
}

export const TEAM: TeamMember[] = [
  { email: 'guswes@gmail.com',        role: 'SUPERADMIN', color: '#b14ef4' },
  { email: 'josefin@theinsiders.se',  role: 'ADMIN',      color: '#f59e0b' },
  { email: 'benjamin@theinsiders.se', role: 'ADMIN',      color: '#22c55e' },
  { email: 'erik@theinsiders.se',     role: 'ADMIN',      color: '#3b82f6' },
];

export const ALLOWED_EMAILS: Record<string, TeamRole> = Object.fromEntries(
  TEAM.map(m => [m.email, m.role])
);

const FALLBACK_PALETTE = [
  '#ec4899', '#06b6d4', '#10b981', '#f97316',
  '#8b5cf6', '#eab308', '#14b8a6', '#f43f5e',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function colorForEmail(email: string | null | undefined): string {
  if (!email) return '#6b7280';
  const e = email.toLowerCase();
  const known = TEAM.find(m => m.email === e);
  if (known) return known.color;
  return FALLBACK_PALETTE[hashStr(e) % FALLBACK_PALETTE.length];
}

export function colorForName(name: string | null | undefined): string {
  if (!name) return '#6b7280';
  return FALLBACK_PALETTE[hashStr(name.toLowerCase()) % FALLBACK_PALETTE.length];
}

export function defaultNameForEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}
