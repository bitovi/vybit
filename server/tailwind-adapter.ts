// Shared interface for Tailwind version adapters.
// Both v3 and v4 adapters implement this contract so the rest of
// the server code is version-agnostic.

export interface TailwindThemeSubset {
  tailwindVersion?: 3 | 4;
  spacing: Record<string, string>;
  colors: Record<string, unknown>;
  fontSize: Record<string, unknown>;
  fontWeight: Record<string, unknown>;
  borderRadius: Record<string, string>;
  /** Default colors for shadow/ring layer types, extracted from compiled CSS.
   *  Keys are layer types ("shadow", "ring", etc.), values are CSS color strings. */
  shadowDefaults?: Record<string, string>;
}

export interface TailwindAdapter {
  readonly version: 3 | 4;
  resolveTailwindConfig(): Promise<TailwindThemeSubset>;
  generateCssForClasses(classes: string[]): Promise<string>;
}
