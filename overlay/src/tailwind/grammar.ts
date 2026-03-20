import { SHADOW_SIZES, TEXT_SHADOW_SIZES } from './scales';

/**
 * Tailwind class grammar layer.
 *
 * Each combinator is a pure function:
 *   (suffix: string) => SegmentResult | null
 *
 * null = "I don't match this suffix"
 * SegmentResult = { props: named fields extracted from the suffix }
 *
 * makeParser() wires a prefix to a combinator and produces a full ParsedToken.
 */

export interface SegmentResult {
  props: Record<string, string>;
}

export type Segment = (suffix: string) => SegmentResult | null;

/** Matches only the empty suffix (exact prefix, e.g. "border" with no suffix). */
export function nothing(): Segment {
  return (suffix) => suffix === '' ? { props: {} } : null;
}

/**
 * Matches a set of explicit keyword values, storing the match under `key`.
 * e.g. keyword('style', ['solid','dashed']) on 'dashed' → { style: 'dashed' }
 */
export function keyword(key: string, values: string[]): Segment {
  const set = new Set(values);
  return (suffix) => set.has(suffix) ? { props: { [key]: suffix } } : null;
}

/**
 * Matches a color token (anything containing a hyphen or recognized as a color name).
 * Stores under `key` (default 'color').
 * A color token is a non-empty suffix that isn't a plain number or keyword reserved
 * by another combinator — we accept it as a color if it looks like `word-number` or
 * is a named color keyword.
 */
export function color(key = 'color'): Segment {
  // Very loose: accept anything non-empty as a potential color.
  // The parser declaration order (oneOf) determines priority — color() should come last.
  return (suffix) => suffix !== '' ? { props: { [key]: suffix } } : null;
}

/**
 * Matches a scale value (anything non-empty, stores under `key`).
 * Also records which scaleName the scale comes from.
 * e.g. scale('spacing') on '4' → { scale: '4', scaleName: 'spacing' }
 */
export function scale(scaleName: string, key = 'scale'): Segment {
  return (suffix) => suffix !== '' ? { props: { [key]: suffix, scaleName } } : null;
}

const SIDES = ['t', 'r', 'b', 'l', 'x', 'y'];
const SIDES_WITH_LOGICAL = ['t', 'r', 'b', 'l', 'x', 'y', 's', 'e', 'bs', 'be'];

/**
 * Optionally consumes a side prefix ('t', 'r', 'b', 'l', 'x', 'y') then delegates
 * the remaining suffix to `inner`.
 * e.g. withSide(scale('spacing')) on 't-4' → { side: 't', scale: '4', scaleName: 'spacing' }
 * e.g. withSide(scale('spacing')) on '4'   → { side: undefined, scale: '4', scaleName: 'spacing' }
 */
export function withSide(inner: Segment): Segment {
  return (suffix) => {
    // Try consuming a side prefix (single or double char, followed by dash)
    for (const side of SIDES) {
      const prefix = side + '-';
      if (suffix.startsWith(prefix)) {
        const rest = suffix.slice(prefix.length);
        const result = inner(rest);
        if (result) return { props: { side, ...result.props } };
      }
    }
    // No side — try inner directly
    return inner(suffix);
  };
}

const CORNERS = ['tl', 'tr', 'br', 'bl'];

/**
 * Optionally consumes a corner prefix ('tl', 'tr', 'br', 'bl') then delegates to `inner`.
 * e.g. withCorner(scale('borderRadius')) on 'tl-lg' → { corner: 'tl', scale: 'lg', scaleName: 'borderRadius' }
 */
export function withCorner(inner: Segment): Segment {
  return (suffix) => {
    for (const corner of CORNERS) {
      const prefix = corner + '-';
      if (suffix.startsWith(prefix)) {
        const rest = suffix.slice(prefix.length);
        const result = inner(rest);
        if (result) return { props: { corner, ...result.props } };
      }
    }
    return inner(suffix);
  };
}

/**
 * Tries each segment in order, returns the first match.
 */
export function oneOf(...segments: Segment[]): Segment {
  return (suffix) => {
    for (const seg of segments) {
      const result = seg(suffix);
      if (result) return result;
    }
    return null;
  };
}

/**
 * Escape hatch for complex parsing logic.
 * Use when a combinator doesn't fit the declarative pattern.
 * e.g. custom((s) => s === 'special' ? { props: { special: true } } : null)
 */
export function custom(fn: Segment): Segment {
  return fn;
}

// ─────────────────────────────────────────────────────────────
// ParsedToken — the output of the grammar layer
// ─────────────────────────────────────────────────────────────

export interface ParsedToken {
  /** Canonical property name, e.g. 'p', 'border', 'display', 'rounded' */
  property: string;
  /** Original full class string, e.g. 'border-t-2' */
  fullClass: string;
  /** Docs section grouping, e.g. 'spacing', 'layout', 'borders' */
  section?: string;
  /** Side modifier: 't' | 'r' | 'b' | 'l' | 'x' | 'y' | 's' | 'e' | 'bs' | 'be' */
  side?: string;
  /** Corner modifier: 'tl' | 'tr' | 'br' | 'bl' */
  corner?: string;
  /** Scale value, e.g. '4', 'lg', 'px', 'full' */
  scale?: string;
  /** ThemeKey for the scale, e.g. 'spacing', 'borderWidth', 'borderRadius' */
  scaleName?: string;
  /** Border/outline style keyword, e.g. 'solid', 'dashed' */
  style?: string;
  /** Color token, e.g. 'red-500', 'slate-200', 'white' */
  color?: string;
  /** Text alignment keyword */
  align?: string;
  /** Named size keyword (e.g. font size: 'sm', 'lg') */
  size?: string;
  /** Generic enum value (display, position, flex keywords) */
  value?: string;
  /** Gradient direction keyword, e.g. 'r', 'tl' (bg-gradient-to-{dir}) */
  direction?: string;
  /** True when the property matched but the suffix wasn't fully recognized */
  unknown?: true;
}

export interface Parser {
  /** Syntactic prefix to match against the class string (e.g. 'pt', 'border', 'rounded-tl') */
  prefix: string;
  /** Segment combinator to parse the suffix */
  segment: Segment;
  /**
   * Optional whole-class matcher. When present, bypasses prefix/suffix matching entirely.
   * Returns a SegmentResult if the class matches, null to skip to the next parser.
   * Used by enumParser() for property-level keyword sets (e.g. display, position).
   */
  matches?: (cls: string) => SegmentResult | null;
  /** Canonical property name for the output token (e.g. 'pt' → canonical 'p') */
  canonical?: string;
  /** Docs section this parser belongs to (e.g. 'spacing', 'layout') */
  section?: string;
  /** Extra props always merged into the token (e.g. { side: 't' }) */
  extraProps?: Record<string, string>;
}

/**
 * Declares a parser for a given prefix.
 */
export function makeParser(prefix: string, segment: Segment): Parser {
  return { prefix, segment };
}

/**
 * Stamps a section label onto every parser in an array.
 * Use to wrap each logical group in TAILWIND_PARSERS.
 *
 * withSection('spacing', [...sideParser('p', ...), makeParser('gap', ...)])
 */
export function withSection(section: string, parsers: Parser[]): Parser[] {
  return parsers.map((p) => ({ ...p, section }));
}

/**
 * Generate parsers for a prefix with directional side variants.
 * sideParser('p', scale('spacing')) produces parsers for:
 *   p-4 → { prefix: 'p', scale: '4' }
 *   pt-4 → { prefix: 'p', side: 't', scale: '4' }
 *   px-8 → { prefix: 'p', side: 'x', scale: '8' }
 *   etc.
 */
export function sideParser(base: string, inner: Segment, sides = SIDES): Parser[] {
  const sideVariants = sides.map((side) => ({
    prefix: base + side,
    segment: inner,
    canonical: base,
    extraProps: { side },
  }));
  return [
    ...sideVariants,
    { prefix: base, segment: inner },
  ];
}

/**
 * Generate parsers for a prefix with corner + side variants.
 * cornerParser('rounded', scale('borderRadius')) produces parsers for:
 *   rounded-tl-lg → { prefix: 'rounded', corner: 'tl', scale: 'lg' }
 *   rounded-t-lg  → { prefix: 'rounded', side: 't', scale: 'lg' }
 *   rounded-lg    → { prefix: 'rounded', scale: 'lg' }
 *   rounded       → { prefix: 'rounded' }
 */
export function cornerParser(base: string, inner: Segment): Parser[] {
  const corners = ['tl', 'tr', 'br', 'bl'];
  const sides = ['t', 'r', 'b', 'l'];
  const cornerVariants = corners.map((corner) => ({
    prefix: base + '-' + corner,
    segment: inner,
    canonical: base,
    extraProps: { corner },
  }));
  const sideVariants = sides.map((side) => ({
    prefix: base + '-' + side,
    segment: inner,
    canonical: base,
    extraProps: { side },
  }));
  return [
    ...cornerVariants,  // longer prefixes first
    ...sideVariants,
    { prefix: base, segment: oneOf(nothing(), inner) },
  ];
}

/**
 * Creates a single-parser entry for a set of full-class keyword values.
 * Bypasses prefix/suffix logic entirely: each class is matched as a complete string.
 * Use for CSS properties whose values are entire standalone classes.
 *
 * enumParser('display', ['block', 'flex', 'grid'])
 * // 'block'   → { prefix: 'display', fullClass: 'block',   value: 'block' }
 * // 'flex'    → { prefix: 'display', fullClass: 'flex',    value: 'flex' }
 * // 'flex-row' → null (not in set, falls through to next parser)
 */
export function enumParser(property: string, values: string[]): Parser {
  const set = new Set(values);
  return {
    prefix: property,
    segment: nothing(), // unused — matches handles the lookup
    matches: (cls) => set.has(cls) ? { props: { value: cls } } : null,
  };
}

/**
 * Parse a single class token against a list of parsers.
 * Returns a ParsedToken or null if no parser's prefix matches.
 */
export function parseToken(cls: string, parsers: Parser[]): ParsedToken | null {
  for (const parser of parsers) {
    const { prefix, matches, segment, canonical, section, extraProps } = parser;

    // Enum parsers: whole-class keyword matching (bypasses prefix/suffix logic)
    if (matches) {
      const result = matches(cls);
      if (!result) continue;
      const token: ParsedToken = { property: canonical ?? prefix, fullClass: cls };
      if (section) token.section = section;
      if (extraProps) {
        for (const [k, v] of Object.entries(extraProps)) {
          (token as Record<string, unknown>)[k] = v;
        }
      }
      for (const [k, v] of Object.entries(result.props)) {
        (token as Record<string, unknown>)[k] = v;
      }
      return token;
    }

    // Prefix-based parsers
    let suffix: string;
    if (cls === prefix) {
      suffix = '';
    } else if (cls.startsWith(prefix + '-')) {
      suffix = cls.slice(prefix.length + 1);
    } else {
      continue;
    }

    const result = segment(suffix);
    if (result) {
      const token: ParsedToken = { property: canonical ?? prefix, fullClass: cls };
      if (section) token.section = section;
      if (extraProps) {
        for (const [k, v] of Object.entries(extraProps)) {
          (token as Record<string, unknown>)[k] = v;
        }
      }
      for (const [k, v] of Object.entries(result.props)) {
        (token as Record<string, unknown>)[k] = v;
      }
      return token;
    }

    // Prefix matched but segment didn't recognize the suffix
    return { property: canonical ?? prefix, fullClass: cls, unknown: true };
  }
  return null;
}

/**
 * Parse all classes in a class string.
 * Unrecognized classes (null from parseToken) are omitted.
 */
export function parseTokens(classString: string, parsers: Parser[]): ParsedToken[] {
  const classes = classString.trim().split(/\s+/).filter(Boolean);
  const results: ParsedToken[] = [];
  for (const cls of classes) {
    const token = parseToken(cls, parsers);
    if (token) results.push(token);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// TAILWIND_PARSERS — full registry
// ─────────────────────────────────────────────────────────────
// Priority: longer/more-specific prefixes first within each group.
// Branch order in oneOf matters: keyword/scale before color (color is greedy).

const BORDER_STYLE_KEYWORDS = ['solid', 'dashed', 'dotted', 'double', 'none', 'hidden'];
const FONT_WEIGHT_KEYWORDS = ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'];
const FONT_SIZE_TOKENS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];
const TRACKING_KEYWORDS = ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest'];
const TEXT_ALIGN_KEYWORDS = ['left', 'center', 'right', 'justify', 'start', 'end'];
// Longer/more-specific values listed first (Set.has() is O(1), but order matters for enumParser readability)
const DISPLAY_KEYWORDS = [
  'inline-block', 'inline-grid', 'inline-flex', 'inline',
  'flow-root',
  'block', 'flex', 'grid', 'contents', 'hidden',
  'table-header-group', 'table-footer-group', 'table-row-group',
  'table-column-group', 'table-caption', 'table-column', 'table-row', 'table-cell', 'table',
];
const POSITION_KEYWORDS = ['static', 'relative', 'absolute', 'fixed', 'sticky'];
// SHADOW_SIZES and TEXT_SHADOW_SIZES imported from './tailwind/scales' are used directly below
const GRADIENT_DIRECTIONS = ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'];

const JUSTIFY_CONTENT_KEYWORDS = ['start', 'end', 'end-safe', 'center', 'center-safe', 'between', 'around', 'evenly', 'stretch', 'baseline', 'normal'];
const ALIGN_ITEMS_KEYWORDS = ['start', 'end', 'end-safe', 'center', 'center-safe', 'baseline', 'baseline-last', 'stretch'];
const ALIGN_CONTENT_KEYWORDS = ['normal', 'start', 'end', 'center', 'between', 'around', 'evenly', 'baseline', 'stretch'];
const JUSTIFY_ITEMS_KEYWORDS = ['start', 'end', 'center', 'stretch'];
const SELF_KEYWORDS = ['auto', 'start', 'end', 'center', 'stretch', 'baseline'];

export const TAILWIND_PARSERS: Parser[] = [
  // ─── SPACING ─────────────────────────────────────────────
  ...withSection('spacing', [
    ...sideParser('m', scale('spacing'), SIDES_WITH_LOGICAL),
    ...sideParser('-m', scale('spacing'), SIDES_WITH_LOGICAL), // negative margins: -m-4, -mt-2, etc.
    ...sideParser('p', scale('spacing'), SIDES_WITH_LOGICAL),
    makeParser('gap-x', scale('spacing')),
    makeParser('gap-y', scale('spacing')),
    makeParser('gap', scale('spacing')),
    makeParser('space-x-reverse', nothing()),
    makeParser('space-y-reverse', nothing()),
    makeParser('space-x', scale('spacing')),
    makeParser('space-y', scale('spacing')),
  ]),

  // ─── SIZING ──────────────────────────────────────────────
  ...withSection('sizing', [
    makeParser('min-w', scale('spacing')),
    makeParser('max-w', scale('spacing')),
    makeParser('min-h', scale('spacing')),
    makeParser('max-h', scale('spacing')),
    makeParser('size', scale('spacing')),
    makeParser('w', scale('spacing')),
    makeParser('h', scale('spacing')),
  ]),

  // ─── TYPOGRAPHY ──────────────────────────────────────────
  ...withSection('typography', [
    // font-family before font- (weight)
    makeParser('font-sans',  nothing()),
    makeParser('font-serif', nothing()),
    makeParser('font-mono',  nothing()),
    makeParser('font', keyword('scale', FONT_WEIGHT_KEYWORDS)),
    // text-shadow must come BEFORE text to prevent 'text-shadow-md' being greedy-matched as text color
    makeParser('text-shadow', oneOf(keyword('size', TEXT_SHADOW_SIZES), color())),
    makeParser('text', oneOf(
      keyword('align', TEXT_ALIGN_KEYWORDS),
      custom((s) => FONT_SIZE_TOKENS.includes(s) ? { props: { size: s, scaleName: 'fontSize' } } : null),
      color(),
    )),
    // leading-none is a keyword; leading-6 is spacing scale
    makeParser('leading', oneOf(keyword('scale', ['none']), scale('spacing'))),
    makeParser('tracking', keyword('scale', TRACKING_KEYWORDS)),
    // Typography keyword utilities (exact-match)
    makeParser('italic',       nothing()),
    makeParser('not-italic',   nothing()),
    makeParser('underline',    nothing()),
    makeParser('line-through', nothing()),
    makeParser('overline',     nothing()),
    makeParser('no-underline', nothing()),
    makeParser('uppercase',    nothing()),
    makeParser('lowercase',    nothing()),
    makeParser('capitalize',   nothing()),
    makeParser('normal-case',  nothing()),
    makeParser('truncate',     nothing()),
    // Vertical align
    makeParser('align-text-top',    nothing()),
    makeParser('align-text-bottom', nothing()),
    makeParser('align-baseline', nothing()),
    makeParser('align-top',      nothing()),
    makeParser('align-middle',   nothing()),
    makeParser('align-bottom',   nothing()),
    makeParser('align-sub',      nothing()),
    makeParser('align-super',    nothing()),
  ]),

  // ─── COLOR / BACKGROUNDS ─────────────────────────────────
  ...withSection('color', [
    makeParser('bg-gradient-to', keyword('direction', GRADIENT_DIRECTIONS)),
    makeParser('bg', color()),
    makeParser('from', color()),
    makeParser('via', color()),
    makeParser('to', color()),
    makeParser('ring', color()),
    makeParser('outline', oneOf(
      keyword('style', ['solid', 'dashed', 'dotted', 'double', 'none']),
      color(),
    )),
    makeParser('fill', color()),
    makeParser('stroke', color()),
    makeParser('decoration', color()),
  ]),

  // ─── BORDERS ─────────────────────────────────────────────
  ...withSection('borders', [
    // Side variants (longer/more-specific prefixes first, before bare 'border')
    { prefix: 'border-bs', segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'bs' } },
    { prefix: 'border-be', segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'be' } },
    { prefix: 'border-x',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'x' } },
    { prefix: 'border-y',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'y' } },
    { prefix: 'border-s',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 's' } },
    { prefix: 'border-e',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'e' } },
    { prefix: 'border-t',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 't' } },
    { prefix: 'border-r',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'r' } },
    { prefix: 'border-b',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'b' } },
    { prefix: 'border-l',  segment: oneOf(nothing(), scale('borderWidth')), canonical: 'border', extraProps: { side: 'l' } },
    // Bare border: style, numeric width (integers + 'px'), or color.
    // custom() for width prevents greedy scale() from consuming color tokens like 'red-500'.
    makeParser('border', oneOf(
      nothing(),
      keyword('style', BORDER_STYLE_KEYWORDS),
      custom((s) => (/^\d+$/.test(s) || s === 'px') ? { props: { scale: s, scaleName: 'borderWidth' } } : null),
      color(),
    )),
    ...cornerParser('rounded', scale('borderRadius')),
  ]),

  // ─── EFFECTS ─────────────────────────────────────────────
  ...withSection('effects', [
    makeParser('opacity', scale('opacity')),
    makeParser('shadow', keyword('size', SHADOW_SIZES)),
  ]),

  // ─── LAYOUT ──────────────────────────────────────────────
  ...withSection('layout', [
    // Display: all mutually-exclusive values map to property 'display'
    enumParser('display', DISPLAY_KEYWORDS),
    // Position: all values map to property 'position'
    enumParser('position', POSITION_KEYWORDS),
    // Inset / positioning — all side variants canonicalize to property 'inset'
    { prefix: 'inset-bs', segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'bs' } },
    { prefix: 'inset-be', segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'be' } },
    { prefix: 'inset-x',  segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'x' } },
    { prefix: 'inset-y',  segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'y' } },
    { prefix: 'inset-s',  segment: scale('spacing'), canonical: 'inset', extraProps: { side: 's' } },
    { prefix: 'inset-e',  segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'e' } },
    { prefix: 'top',      segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'top' } },
    { prefix: 'right',    segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'right' } },
    { prefix: 'bottom',   segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'bottom' } },
    { prefix: 'left',     segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'left' } },
    { prefix: 'start',    segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'start' } },
    { prefix: 'end',      segment: scale('spacing'), canonical: 'inset', extraProps: { side: 'end' } },
    makeParser('inset', scale('spacing')),
    makeParser('z', scale('zIndex')),
  ]),

  // ─── FLEXBOX & GRID ──────────────────────────────────────
  ...withSection('flexbox', [
    // Flex direction compound keywords (not in display enum — these have meaningful suffixes)
    makeParser('flex-row-reverse', nothing()),
    makeParser('flex-col-reverse', nothing()),
    makeParser('flex-wrap-reverse', nothing()),
    makeParser('flex-row',    nothing()),
    makeParser('flex-col',    nothing()),
    makeParser('flex-wrap',   nothing()),
    makeParser('flex-nowrap', nothing()),
    // bare 'flex' is caught by display enum above; flex-{n} / flex-auto etc. handled here
    makeParser('flex', oneOf(
      nothing(),
      keyword('value', ['auto', 'initial', 'none']),
      scale('number'),
    )),
    makeParser('grow',   oneOf(nothing(), scale('number'))),
    makeParser('shrink', oneOf(nothing(), scale('number'))),
    makeParser('justify-items', keyword('value', JUSTIFY_ITEMS_KEYWORDS)),
    makeParser('justify', keyword('value', JUSTIFY_CONTENT_KEYWORDS)),
    makeParser('items', keyword('value', ALIGN_ITEMS_KEYWORDS)),
    makeParser('content', keyword('value', ALIGN_CONTENT_KEYWORDS)),
    makeParser('self', keyword('value', SELF_KEYWORDS)),
    makeParser('basis', scale('spacing')),
    // Grid: keyword variants before scale (scale is greedy)
    makeParser('grid-cols', oneOf(keyword('value', ['none', 'subgrid']), scale('gridCols'))),
    makeParser('grid-rows', oneOf(keyword('value', ['none', 'subgrid']), scale('gridRows'))),
    makeParser('col-span', scale('colSpan')),
    makeParser('row-span', scale('rowSpan')),
    makeParser('order', scale('order')),
  ]),

  // ─── OVERFLOW ────────────────────────────────────────────
  ...withSection('overflow', [
    makeParser('overflow-x', keyword('value', ['auto', 'hidden', 'clip', 'visible', 'scroll'])),
    makeParser('overflow-y', keyword('value', ['auto', 'hidden', 'clip', 'visible', 'scroll'])),
    makeParser('overflow', keyword('value', ['auto', 'hidden', 'clip', 'visible', 'scroll'])),
  ]),
];
