export type ValueType = 'scalar' | 'enum' | 'color';

export interface ParsedClass {
  category: 'spacing' | 'sizing' | 'typography' | 'color' | 'borders' | 'effects' | 'layout' | 'flexbox' | 'gradient';
  valueType: ValueType;
  prefix: string;
  value: string;
  fullClass: string;
  themeKey: string | null;
}

/** Derives the value type from the themeKey.
 * - 'colors' → color picker
 * - any other non-null themeKey → ordered scalar scale (ScaleScrubber)
 * - null → discrete enum keyword (no sub-editor yet)
 */
function deriveValueType(themeKey: string | null): ValueType {
  if (themeKey === 'colors') return 'color';
  if (themeKey !== null) return 'scalar';
  return 'enum';
}

interface PrefixEntry {
  prefix: string;
  category: ParsedClass['category'];
  themeKey: string | null;
}

const PREFIX_MAP: PrefixEntry[] = [
  // Spacing
  { prefix: 'px-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'py-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'pt-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'pr-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'pb-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'pl-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'ps-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'pe-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'p-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'mx-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'my-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'mt-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'mr-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'mb-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'ml-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'ms-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'me-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'm-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'gap-x-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'gap-y-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'gap-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'space-x-', category: 'spacing', themeKey: 'spacing' },
  { prefix: 'space-y-', category: 'spacing', themeKey: 'spacing' },
  // Sizing
  { prefix: 'min-w-', category: 'sizing', themeKey: 'spacing' },
  { prefix: 'max-w-', category: 'sizing', themeKey: 'spacing' },
  { prefix: 'min-h-', category: 'sizing', themeKey: 'spacing' },
  { prefix: 'max-h-', category: 'sizing', themeKey: 'spacing' },
  { prefix: 'size-', category: 'sizing', themeKey: 'spacing' },
  { prefix: 'w-', category: 'sizing', themeKey: 'spacing' },
  { prefix: 'h-', category: 'sizing', themeKey: 'spacing' },
  // Color
  { prefix: 'bg-gradient-to-', category: 'gradient', themeKey: null },
  { prefix: 'bg-', category: 'color', themeKey: 'colors' },
  // Gradient stops
  { prefix: 'from-', category: 'gradient', themeKey: 'colors' },
  { prefix: 'via-', category: 'gradient', themeKey: 'colors' },
  { prefix: 'to-', category: 'gradient', themeKey: 'colors' },
  { prefix: 'ring-', category: 'color', themeKey: 'colors' },
  { prefix: 'outline-', category: 'color', themeKey: 'colors' },
  { prefix: 'fill-', category: 'color', themeKey: 'colors' },
  { prefix: 'stroke-', category: 'color', themeKey: 'colors' },
  { prefix: 'decoration-', category: 'color', themeKey: 'colors' },
  // Typography
  { prefix: 'font-', category: 'typography', themeKey: 'fontWeight' },
  { prefix: 'leading-', category: 'typography', themeKey: 'lineHeight' },
  { prefix: 'tracking-', category: 'typography', themeKey: 'letterSpacing' },
  // Borders
  { prefix: 'rounded-tl-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-tr-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-br-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-bl-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-t-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-r-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-b-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-l-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'rounded-', category: 'borders', themeKey: 'borderRadius' },
  { prefix: 'border-t-', category: 'borders', themeKey: 'borderWidth' },
  { prefix: 'border-r-', category: 'borders', themeKey: 'borderWidth' },
  { prefix: 'border-b-', category: 'borders', themeKey: 'borderWidth' },
  { prefix: 'border-l-', category: 'borders', themeKey: 'borderWidth' },
  // Effects
  { prefix: 'opacity-', category: 'effects', themeKey: null },
  { prefix: 'shadow-', category: 'effects', themeKey: null },
  // Layout
  { prefix: 'inset-', category: 'layout', themeKey: 'spacing' },
  { prefix: 'top-', category: 'layout', themeKey: 'spacing' },
  { prefix: 'right-', category: 'layout', themeKey: 'spacing' },
  { prefix: 'bottom-', category: 'layout', themeKey: 'spacing' },
  { prefix: 'left-', category: 'layout', themeKey: 'spacing' },
  { prefix: 'z-', category: 'layout', themeKey: null },
  // Flexbox & Grid
  { prefix: 'basis-', category: 'flexbox', themeKey: 'spacing' },
  { prefix: 'grid-cols-', category: 'flexbox', themeKey: null },
  { prefix: 'grid-rows-', category: 'flexbox', themeKey: null },
  { prefix: 'col-span-', category: 'flexbox', themeKey: null },
  { prefix: 'row-span-', category: 'flexbox', themeKey: null },
  { prefix: 'order-', category: 'flexbox', themeKey: null },
].sort((a, b) => b.prefix.length - a.prefix.length);

// border-* disambiguation: these values mean border width/style, not color
const BORDER_WIDTH_VALUES = new Set(['0', '2', '4', '8']);
const BORDER_STYLE_KEYWORDS = new Set(['solid', 'dashed', 'dotted', 'double', 'hidden', 'none']);

// text-* disambiguation
const FONT_SIZE_TOKENS = new Set(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']);
const TEXT_ALIGN_KEYWORDS = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);

const EXACT_MATCH_MAP: Record<string, { category: ParsedClass['category']; themeKey: string | null }> = {
  // Borders
  'rounded': { category: 'borders', themeKey: 'borderRadius' },
  'border': { category: 'borders', themeKey: 'borderWidth' },
  // Effects
  'shadow': { category: 'effects', themeKey: null },
  // Typography
  'underline': { category: 'typography', themeKey: null },
  'overline': { category: 'typography', themeKey: null },
  'line-through': { category: 'typography', themeKey: null },
  'no-underline': { category: 'typography', themeKey: null },
  'uppercase': { category: 'typography', themeKey: null },
  'lowercase': { category: 'typography', themeKey: null },
  'capitalize': { category: 'typography', themeKey: null },
  'normal-case': { category: 'typography', themeKey: null },
  'truncate': { category: 'typography', themeKey: null },
  'italic': { category: 'typography', themeKey: null },
  'not-italic': { category: 'typography', themeKey: null },
  // Font family (must come before font- prefix in PREFIX_MAP)
  'font-sans':  { category: 'typography', themeKey: null },
  'font-serif': { category: 'typography', themeKey: null },
  'font-mono':  { category: 'typography', themeKey: null },
  // Vertical alignment
  'align-baseline':    { category: 'typography', themeKey: null },
  'align-top':         { category: 'typography', themeKey: null },
  'align-middle':      { category: 'typography', themeKey: null },
  'align-bottom':      { category: 'typography', themeKey: null },
  'align-text-top':    { category: 'typography', themeKey: null },
  'align-text-bottom': { category: 'typography', themeKey: null },
  'align-sub':         { category: 'typography', themeKey: null },
  'align-super':       { category: 'typography', themeKey: null },
  // Layout
  'block': { category: 'layout', themeKey: null },
  'inline-block': { category: 'layout', themeKey: null },
  'inline': { category: 'layout', themeKey: null },
  'flex': { category: 'layout', themeKey: null },
  'inline-flex': { category: 'layout', themeKey: null },
  'grid': { category: 'layout', themeKey: null },
  'inline-grid': { category: 'layout', themeKey: null },
  'hidden': { category: 'layout', themeKey: null },
  'table': { category: 'layout', themeKey: null },
  'contents': { category: 'layout', themeKey: null },
  'static': { category: 'layout', themeKey: null },
  'fixed': { category: 'layout', themeKey: null },
  'absolute': { category: 'layout', themeKey: null },
  'relative': { category: 'layout', themeKey: null },
  'sticky': { category: 'layout', themeKey: null },
  // Flexbox
  'flex-row': { category: 'flexbox', themeKey: null },
  'flex-row-reverse': { category: 'flexbox', themeKey: null },
  'flex-col': { category: 'flexbox', themeKey: null },
  'flex-col-reverse': { category: 'flexbox', themeKey: null },
  'flex-wrap': { category: 'flexbox', themeKey: null },
  'flex-wrap-reverse': { category: 'flexbox', themeKey: null },
  'flex-nowrap': { category: 'flexbox', themeKey: null },
  'flex-1': { category: 'flexbox', themeKey: null },
  'flex-auto': { category: 'flexbox', themeKey: null },
  'flex-initial': { category: 'flexbox', themeKey: null },
  'flex-none': { category: 'flexbox', themeKey: null },
  'grow': { category: 'flexbox', themeKey: null },
  'grow-0': { category: 'flexbox', themeKey: null },
  'shrink': { category: 'flexbox', themeKey: null },
  'shrink-0': { category: 'flexbox', themeKey: null },
  'justify-start': { category: 'flexbox', themeKey: null },
  'justify-end': { category: 'flexbox', themeKey: null },
  'justify-center': { category: 'flexbox', themeKey: null },
  'justify-between': { category: 'flexbox', themeKey: null },
  'justify-around': { category: 'flexbox', themeKey: null },
  'justify-evenly': { category: 'flexbox', themeKey: null },
  'justify-stretch': { category: 'flexbox', themeKey: null },
  'items-start': { category: 'flexbox', themeKey: null },
  'items-end': { category: 'flexbox', themeKey: null },
  'items-center': { category: 'flexbox', themeKey: null },
  'items-baseline': { category: 'flexbox', themeKey: null },
  'items-stretch': { category: 'flexbox', themeKey: null },
  'self-auto': { category: 'flexbox', themeKey: null },
  'self-start': { category: 'flexbox', themeKey: null },
  'self-end': { category: 'flexbox', themeKey: null },
  'self-center': { category: 'flexbox', themeKey: null },
  'self-stretch': { category: 'flexbox', themeKey: null },
  'self-baseline': { category: 'flexbox', themeKey: null },
};

// Responsive and state prefixes to strip
const VARIANT_PREFIXES = /^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|visited:|first:|last:|odd:|even:|group-hover:|focus-within:|focus-visible:|dark:|motion-safe:|motion-reduce:)+/;

function hasVariantPrefix(cls: string): boolean {
  return VARIANT_PREFIXES.test(cls);
}

function parseTextClass(value: string): ParsedClass | null {
  if (FONT_SIZE_TOKENS.has(value)) {
    return { category: 'typography', valueType: 'scalar', prefix: 'text-', value, fullClass: `text-${value}`, themeKey: 'fontSize' };
  }
  if (TEXT_ALIGN_KEYWORDS.has(value)) {
    return { category: 'typography', valueType: 'enum', prefix: 'text-', value, fullClass: `text-${value}`, themeKey: null };
  }
  // Otherwise treat as text color (typography, not backgrounds)
  return { category: 'typography', valueType: 'color', prefix: 'text-', value, fullClass: `text-${value}`, themeKey: 'colors' };
}

function parseBorderClass(value: string): ParsedClass | null {
  if (BORDER_WIDTH_VALUES.has(value)) {
    return { category: 'borders', valueType: 'scalar', prefix: 'border-', value, fullClass: `border-${value}`, themeKey: 'borderWidth' };
  }
  if (BORDER_STYLE_KEYWORDS.has(value)) {
    return { category: 'borders', valueType: 'enum', prefix: 'border-', value, fullClass: `border-${value}`, themeKey: null };
  }
  // Otherwise treat as color
  return { category: 'color', valueType: 'color', prefix: 'border-', value, fullClass: `border-${value}`, themeKey: 'colors' };
}

export function parseClasses(classString: string): ParsedClass[] {
  const results: ParsedClass[] = [];
  const classes = classString.trim().split(/\s+/).filter(Boolean);

  for (const cls of classes) {
    // Skip classes with responsive/state variant prefixes
    if (hasVariantPrefix(cls)) continue;

    // Check exact matches first
    const exact = EXACT_MATCH_MAP[cls];
    if (exact) {
      results.push({
        category: exact.category,
        valueType: deriveValueType(exact.themeKey),
        prefix: cls,
        value: '',
        fullClass: cls,
        themeKey: exact.themeKey,
      });
      continue;
    }

    // Disambiguate text-* classes
    if (cls.startsWith('text-')) {
      const value = cls.slice(5);
      const parsed = parseTextClass(value);
      if (parsed) results.push(parsed);
      continue;
    }

    // Disambiguate border-* classes (not already matched by longer prefixes like border-t-)
    if (cls.startsWith('border-')) {
      const value = cls.slice(7);
      // Check if a longer prefix matches first (border-t-, border-r-, etc.)
      let longerMatch = false;
      for (const entry of PREFIX_MAP) {
        if (entry.prefix !== 'border-' && cls.startsWith(entry.prefix)) {
          longerMatch = true;
          results.push({
            category: entry.category,
            valueType: deriveValueType(entry.themeKey),
            prefix: entry.prefix,
            value: cls.slice(entry.prefix.length),
            fullClass: cls,
            themeKey: entry.themeKey,
          });
          break;
        }
      }
      if (!longerMatch) {
        const parsed = parseBorderClass(value);
        if (parsed) results.push(parsed);
      }
      continue;
    }

    // Normal prefix matching (longest match first, already sorted)
    let matched = false;
    for (const entry of PREFIX_MAP) {
      if (cls.startsWith(entry.prefix)) {
        results.push({
          category: entry.category,
          valueType: deriveValueType(entry.themeKey),
          prefix: entry.prefix,
          value: cls.slice(entry.prefix.length),
          fullClass: cls,
          themeKey: entry.themeKey,
        });
        matched = true;
        break;
      }
    }

    // Unknown classes are skipped
    if (!matched) {
      // Skip silently
    }
  }

  return results;
}
