const SPECIAL_SPACING_ORDER: Record<string, number> = {
  px: 0.0625,  // between 0 and 0.5
};

export function spacingKeyOrder(k: string): number {
  if (!isNaN(Number(k))) return Number(k);
  return SPECIAL_SPACING_ORDER[k] ?? Infinity;
}

export function getScaleValues(prefix: string, themeKey: string | null, config: any): string[] {
  if (themeKey === 'spacing' && config?.spacing) {
    const keys = Object.keys(config.spacing);
    return keys
      .sort((a, b) => spacingKeyOrder(a) - spacingKeyOrder(b))
      .map((k) => `${prefix}${k}`);
  }
  if (themeKey === 'fontSize') {
    return ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl'];
  }
  if (themeKey === 'fontWeight') {
    return ['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'];
  }
  if (themeKey === 'borderRadius') {
    return ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full'];
  }
  if (themeKey === 'lineHeight') {
    return ['leading-none', 'leading-tight', 'leading-snug', 'leading-normal', 'leading-relaxed', 'leading-loose', 'leading-3', 'leading-4', 'leading-5', 'leading-6', 'leading-7', 'leading-8', 'leading-9', 'leading-10'];
  }
  if (themeKey === 'letterSpacing') {
    return ['tracking-tighter', 'tracking-tight', 'tracking-normal', 'tracking-wide', 'tracking-wider', 'tracking-widest'];
  }
  return [];
}
