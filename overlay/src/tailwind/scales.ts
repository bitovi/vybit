/**
 * Canonical Tailwind scale arrays.
 * Single source of truth consumed by the grammar parser, panel UI, and overlay.
 * The Set variants are derived here for O(1) membership tests.
 */

// ─── Shadow / Ring ────────────────────────────────────────────────────────────
export const SHADOW_SIZES        = ['none', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
export const INSET_SHADOW_SIZES  = ['none', '2xs', 'xs', 'sm'] as const;
export const RING_WIDTHS         = ['0', '1', '2', '4', '8'] as const;
/** Tailwind ships text-shadow-{2xs|xs|sm|md|lg} + text-shadow-none only (no xl/2xl). */
export const TEXT_SHADOW_SIZES   = ['none', '2xs', 'xs', 'sm', 'md', 'lg'] as const;

// ─── Sets derived from the arrays above ──────────────────────────────────────
export const SHADOW_SIZE_SET       = new Set<string>(SHADOW_SIZES);
export const INSET_SHADOW_SIZE_SET = new Set<string>(INSET_SHADOW_SIZES);
export const RING_WIDTH_SET        = new Set<string>(RING_WIDTHS);
export const TEXT_SHADOW_SIZE_SET  = new Set<string>(TEXT_SHADOW_SIZES);

// ─── Typography ───────────────────────────────────────────────────────────────
export const FONT_SIZES = [
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
  'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
  'text-7xl', 'text-8xl', 'text-9xl',
] as const;

export const FONT_WEIGHTS = [
  'font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium',
  'font-semibold', 'font-bold', 'font-extrabold', 'font-black',
] as const;

export const LINE_HEIGHTS = [
  'leading-none', 'leading-tight', 'leading-snug', 'leading-normal',
  'leading-relaxed', 'leading-loose',
  'leading-3', 'leading-4', 'leading-5', 'leading-6', 'leading-7',
  'leading-8', 'leading-9', 'leading-10',
] as const;

export const LETTER_SPACINGS = [
  'tracking-tighter', 'tracking-tight', 'tracking-normal',
  'tracking-wide', 'tracking-wider', 'tracking-widest',
] as const;

export const OPACITY_VALUES = Array.from({ length: 21 }, (_, i) => `opacity-${i * 5}`);

// ─── Border / Radius ──────────────────────────────────────────────────────────
/** Suffixes for rounded-* utilities. Empty string = base class ('rounded'). */
export const BORDER_RADIUS_SUFFIXES = ['none', 'sm', '', 'md', 'lg', 'xl', '2xl', '3xl', 'full'] as const;
export const RADIUS_SCALE = BORDER_RADIUS_SUFFIXES.map(s => s ? `rounded-${s}` : 'rounded');
export function cornerScale(prefix: string): string[] {
  return BORDER_RADIUS_SUFFIXES.map(s => s ? `${prefix}-${s}` : prefix);
}

export const BORDER_WIDTH_STEPS = ['0', '', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32', '40', '48', '56', '64'] as const;
export const BORDER_STYLE_STEPS = ['solid', 'dashed', 'dotted', 'double', 'hidden', 'none'] as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const SPACING_STEPS = [
  '0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96',
] as const;

// ─── Colors ───────────────────────────────────────────────────────────────────
export const HUE_ORDER = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
] as const;

export const SHADE_ORDER = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
