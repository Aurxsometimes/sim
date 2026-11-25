/**
 * Custom background + accent colors, replacing DIM's fixed themes. The app
 * always uses the True Black theme as its base (see _theme-black.scss) and
 * these colors are layered on top as inline CSS variables on <body>.
 *
 * Colors are saved in this browser's localStorage.
 */

export interface CustomColors {
  /** Page background, e.g. #000000 */
  background: string;
  /** Highlight color for hover/active/focus, e.g. #d56520 */
  accent: string;
}

export const DEFAULT_COLORS: CustomColors = { background: '#000000', accent: '#d56520' };

const STORAGE_KEY = 'customColors';
const HEX = /^#[\da-f]{6}$/i;

export function loadCustomColors(): CustomColors {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<CustomColors>;
    return {
      background: HEX.test(saved.background ?? '') ? saved.background! : DEFAULT_COLORS.background,
      accent: HEX.test(saved.accent ?? '') ? saved.accent! : DEFAULT_COLORS.accent,
    };
  } catch {
    return DEFAULT_COLORS;
  }
}

export function saveCustomColors(colors: CustomColors) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyCustomColors(colors);
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Shift a color toward white (on dark backgrounds) or black (on light ones)
 * by `amount` (0-1), so panels stand out from the page background.
 */
export function raise(hex: string, amount: number) {
  const target = luminance(hex) > 0.4 ? 0 : 255;
  const rgb = parseHex(hex);
  return toHex(rgb.map((c) => c + (target - c) * amount) as [number, number, number]);
}

/** CSS variables to set for a given pair of colors. */
export function customColorVariables({ background, accent }: CustomColors): Record<string, string> {
  const light = luminance(background) > 0.4;
  return {
    // Accent
    '--theme-accent-primary': accent,

    // Page + header backgrounds
    '--theme-app-bg': background,
    '--theme-app-bg-gradient-start': background,
    '--theme-app-bg-gradient-end': background,
    '--theme-header-nav-bg': background,
    '--theme-header-characters-bg': background,
    '--theme-pwa-background': background,

    // Raised surfaces
    '--theme-fill-modal': raise(background, 0.03),
    '--theme-fill-modal-actions': raise(background, 0.07),
    '--theme-search-bg': raise(background, 0.08),
    '--theme-input-bg': raise(background, 0.1),
    '--theme-item-popup-border': raise(background, 0.1),
    '--theme-item-popup-panel-bg': raise(background, 0.1),
    '--theme-item-popup-progress-bar-bg': raise(background, 0.07),
    '--theme-tooltip-header-bg': background,
    '--theme-tooltip-body-bg': raise(background, 0.05),
    '--theme-organizer-row-odd-bg': background,
    '--theme-organizer-row-even-bg': raise(background, 0.05),

    // Keep text readable if someone picks a light background
    '--theme-text': light ? '#111111' : '#efefef',
    '--theme-text-secondary': light ? '#444444' : '#aaaaaa',
  };
}

export function applyCustomColors(colors: CustomColors = loadCustomColors()) {
  for (const [name, value] of Object.entries(customColorVariables(colors))) {
    document.body.style.setProperty(name, value);
  }
  document.querySelector("meta[name='theme-color']")?.setAttribute('content', colors.background);
}
