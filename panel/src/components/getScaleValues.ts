import {
  FONT_SIZES, FONT_WEIGHTS, RADIUS_SCALE, LINE_HEIGHTS, LETTER_SPACINGS, OPACITY_VALUES,
} from '../../../overlay/src/tailwind/scales';

const SPECIAL_SPACING_ORDER: Record<string, number> = {
  px: 0.0625,  // between 0 and 0.5
};

export function spacingKeyOrder(k: string): number {
  if (!isNaN(Number(k))) return Number(k);
  return SPECIAL_SPACING_ORDER[k] ?? Infinity;
}

export function getScaleValues(prefix: string, scaleName: string | null, config: any): string[] {
  if (scaleName === 'spacing' && config?.spacing) {
    const keys = Object.keys(config.spacing);
    return keys
      .sort((a, b) => spacingKeyOrder(a) - spacingKeyOrder(b))
      .map((k) => `${prefix}${k}`);
  }
  if (scaleName === 'fontSize')     return [...FONT_SIZES];
  if (scaleName === 'fontWeight')   return [...FONT_WEIGHTS];
  if (scaleName === 'borderRadius') return RADIUS_SCALE;
  if (scaleName === 'lineHeight')   return [...LINE_HEIGHTS];
  if (scaleName === 'letterSpacing') return [...LETTER_SPACINGS];
  if (scaleName === 'opacity')      return OPACITY_VALUES;
  return [];
}
