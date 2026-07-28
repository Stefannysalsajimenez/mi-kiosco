export const baseColors = {
  background: '#0f1115',
  surface: '#181b21',
  surfaceAlt: '#22262e',
  border: '#303640',
  text: '#f8fafc',
  muted: '#9ca3af',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#38bdf8',
  white: '#ffffff'
};

export const DEFAULT_BRANDING = {
  storeName: 'Kiosco',
  storeTagline: 'Productos actualizados en tiempo real.',
  storeLogoUrl: '',
  storeEmoji: '🛍️',
  accentColor: '#f97316'
};

export function normalizeHexColor(value, fallback = DEFAULT_BRANDING.accentColor) {
  const candidate = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback;
}

export function hexToRgba(hex, alpha = 1) {
  const color = normalizeHexColor(hex);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createTheme(branding = DEFAULT_BRANDING) {
  const primary = normalizeHexColor(branding.accentColor);
  return {
    ...baseColors,
    primary,
    primarySoft: hexToRgba(primary, 0.18),
    primaryBorder: hexToRgba(primary, 0.48),
    primaryShadow: hexToRgba(primary, 0.34)
  };
}
