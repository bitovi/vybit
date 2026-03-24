import { getRuleForClass, PROPERTY_RULES } from './propertyRules';

export type ValueType = 'scalar' | 'enum' | 'color';

export interface ParsedClass {
  category: 'padding' | 'margin' | 'sizing' | 'typography' | 'color' | 'borders' | 'effects' | 'layout' | 'flexbox' | 'gradient';
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

// Responsive and state prefixes to strip
const VARIANT_PREFIXES = /^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|visited:|first:|last:|odd:|even:|group-hover:|focus-within:|focus-visible:|dark:|motion-safe:|motion-reduce:)+/;

function hasVariantPrefix(cls: string): boolean {
  return VARIANT_PREFIXES.test(cls);
}

// text-* disambiguation
const FONT_SIZE_TOKENS = new Set(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']);
const TEXT_ALIGN_KEYWORDS = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);

// border-* disambiguation
const BORDER_WIDTH_VALUES = new Set(['0', '2', '4', '8']);
const BORDER_STYLE_KEYWORDS = new Set(['solid', 'dashed', 'dotted', 'double', 'hidden', 'none']);

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

function parseBorderClass(value: string, hasLongerPrefix: boolean): ParsedClass | null {
  if (hasLongerPrefix) return null;  // border-t-, border-r-, etc. take precedence
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

    // Try exact match first
    const rule = PROPERTY_RULES[cls];
    if (rule) {
      results.push({
        category: rule.category,
        valueType: deriveValueType(rule.themeKey),
        prefix: cls,
        value: '',
        fullClass: cls,
        themeKey: rule.themeKey,
      });
      continue;
    }

    // Special handling for text-* (may be font-size, text-align, or text-color)
    if (cls.startsWith('text-')) {
      const value = cls.slice(5);
      const parsed = parseTextClass(value);
      if (parsed) results.push(parsed);
      continue;
    }

    // Special handling for border-* (disambiguate between longer prefixes, width, style, color)
    if (cls.startsWith('border-')) {
      const value = cls.slice(7);
      // Check for longer prefix match (border-t-, border-r-, etc.)
      const longerPrefixes = ['border-t-', 'border-r-', 'border-b-', 'border-l-'];
      let foundLonger = false;
      for (const prefix of longerPrefixes) {
        if (cls.startsWith(prefix)) {
          const prefixRule = PROPERTY_RULES[prefix];
          if (prefixRule) {
            results.push({
              category: prefixRule.category,
              valueType: deriveValueType(prefixRule.themeKey),
              prefix,
              value: cls.slice(prefix.length),
              fullClass: cls,
              themeKey: prefixRule.themeKey,
            });
          }
          foundLonger = true;
          break;
        }
      }
      if (!foundLonger) {
        const parsed = parseBorderClass(value, false);
        if (parsed) results.push(parsed);
      }
      continue;
    }

    // Try prefix match (use propertyRules getRuleForClass)
    const prefixRule = getRuleForClass(cls);
    if (prefixRule) {
      // Find matching prefix
      const matchingPrefixes = Object.keys(PROPERTY_RULES)
        .filter(key => key.endsWith('-') && cls.startsWith(key))
        .sort((a, b) => b.length - a.length);
      
      if (matchingPrefixes.length > 0) {
        const prefix = matchingPrefixes[0];
        results.push({
          category: prefixRule.category,
          valueType: deriveValueType(prefixRule.themeKey),
          prefix,
          value: cls.slice(prefix.length),
          fullClass: cls,
          themeKey: prefixRule.themeKey,
        });
      }
    }
  }

  return results;
}
