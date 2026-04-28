/**
 * BeachVibes Design System — Colors
 * Mirrored from the web app's globals.css for visual consistency.
 */

export const Colors = {
  // Brand
  brandPrimary: '#f97316',
  brandPrimaryLight: '#fb923c',
  brandPrimaryDark: '#ea580c',
  brandAccent: '#06b6d4',
  brandAccentLight: '#22d3ee',
  brandHeart: '#ef4444',
  brandPink: '#ec4899',
  brandPinkLight: '#f472b6',
  brandNeon: '#00e5ff',

  // Semantic
  success: '#22c55e',
  successLight: '#86efac',
  warning: '#fbbf24',
  warningLight: '#fcd34d',
  error: '#ef4444',
  errorLight: '#fca5a5',
  info: '#06b6d4',
  infoLight: '#22d3ee',

  // Skill Levels
  skillRookie: '#86efac',
  skillIntermediate: '#93c5fd',
  skillCompetitive: '#a78bfa',
  skillAdvanced: '#c4b5fd',
  skillElite: '#fcd34d',

  // Backgrounds (dark theme)
  bgPrimary: '#0f1117',
  bgSecondary: '#1a1d27',
  bgTertiary: '#242836',
  bgElevated: '#2a2e3d',
  bgSurface: 'rgba(255, 255, 255, 0.04)',
  bgSurfaceHover: 'rgba(255, 255, 255, 0.08)',

  // Text
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textInverse: '#0f172a',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderDefault: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.2)',

  // Tab bar
  tabBarBg: '#0f1117',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  tabActive: '#f97316',
  tabInactive: '#64748b',
} as const;

export const Gradients = {
  brand: ['#f97316', '#ef4444', '#ec4899'] as const,
  hero: ['#0f1117', '#1a1127', '#1a2744'] as const,
} as const;
