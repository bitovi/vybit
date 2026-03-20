/**
 * Centralized property rules for all Tailwind utilities.
 * Single source of truth for:
 * - Parser: what category/themeKey each class belongs to
 * - Picker: what properties can be added, how they render, enum alternatives
 * - Both: avoiding duplication and keeping behavior consistent
 */

export type Category = 'spacing' | 'sizing' | 'typography' | 'color' | 'borders' | 'effects' | 'layout' | 'flexbox' | 'gradient';
export type ValueType = 'scalar' | 'enum' | 'color';
export type RenderMode = 'chip' | 'scrubber' | 'boxmodel' | 'gradient-editor';

export interface PropertyRule {
  category: Category;
  themeKey: string | null;
  valueType: ValueType;
  addable?: boolean;  // Can be added via [+] menu (mark on canonical/first enum alt)
  enumAlts?: string[];  // For enum types: alternatives to show in scrubber
  propertyKey?: string;  // Staging key for patchManager dedup (defaults to entry key minus trailing dash)
  renderMode?: RenderMode;  // How to display this property
  isComposite?: boolean;  // Multiple prefixes render as one unit
  compositeRelatedPrefixes?: string[];  // All prefixes consumed by this composite
  compositeExactMatches?: string[];  // Exact class names also consumed
}

export const PROPERTY_RULES: Record<string, PropertyRule> = {
  // ─────────────────────────────────────────────────────────────
  // SPACING
  // ─────────────────────────────────────────────────────────────
  'm-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar', renderMode: 'boxmodel', isComposite: true,
    compositeRelatedPrefixes: [
      // BoxModel: margin layer
      'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'ms-', 'me-',
      // BoxModel: padding layer
      'p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'ps-', 'pe-',
      // BoxModel: padding layer (gap/space render inside padding area)
      'gap-', 'gap-x-', 'gap-y-', 'space-x-', 'space-y-',
      // BoxModel: border layer (width slots — style/color slots derived from class keywords)
      'border-', 'border-t-', 'border-r-', 'border-b-', 'border-l-',
      // TODO: no BoxModel layer yet — rounded-* are consumed here but never displayed anywhere
      'rounded-', 'rounded-t-', 'rounded-r-', 'rounded-b-', 'rounded-l-',
      'rounded-tl-', 'rounded-tr-', 'rounded-br-', 'rounded-bl-',
    ],
    compositeExactMatches: [
      'border',   // BoxModel: border layer shorthand
      'rounded',  // TODO: no BoxModel layer yet — consumed here but never displayed
    ] },
  'mx-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'my-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'mt-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'mr-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'mb-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'ml-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'ms-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'me-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'p-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'px-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'py-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'pt-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'pr-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'pb-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'pl-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'ps-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'pe-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'gap-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'gap-x-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'gap-y-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'space-x-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },
  'space-y-': { category: 'spacing', themeKey: 'spacing', valueType: 'scalar' },

  // ─────────────────────────────────────────────────────────────
  // SIZING
  // ─────────────────────────────────────────────────────────────
  'w-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'width' },
  'h-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'height' },
  'min-w-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'min-width' },
  'max-w-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'max-width' },
  'min-h-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'min-height' },
  'max-h-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'max-height' },
  'size-': { category: 'sizing', themeKey: 'spacing', valueType: 'scalar', addable: true, propertyKey: 'size' },

  // ─────────────────────────────────────────────────────────────
  // TYPOGRAPHY
  // ─────────────────────────────────────────────────────────────
  'font-': { category: 'typography', themeKey: 'fontWeight', valueType: 'scalar', addable: true },
  'text-': { category: 'typography', themeKey: null, valueType: 'enum' },  // Specialized handling in parser
  'leading-': { category: 'typography', themeKey: 'lineHeight', valueType: 'scalar', addable: true },
  'tracking-': { category: 'typography', themeKey: 'letterSpacing', valueType: 'scalar', addable: true },
  // Text align (explicit entries so parser exact-matches them, and enum groups are generated)
  'text-left':    { category: 'typography', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'text-align', enumAlts: ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'] },
  'text-center':  { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-align', enumAlts: ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'] },
  'text-right':   { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-align', enumAlts: ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'] },
  'text-justify': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-align', enumAlts: ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'] },
  'text-start':   { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-align', enumAlts: ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'] },
  'text-end':     { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-align', enumAlts: ['text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end'] },
  'italic':     { category: 'typography', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'font-style', enumAlts: ['italic', 'not-italic'] },
  'not-italic': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'font-style', enumAlts: ['italic', 'not-italic'] },
  'underline':    { category: 'typography', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'text-decoration', enumAlts: ['underline', 'line-through', 'overline', 'no-underline'] },
  'line-through': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-decoration', enumAlts: ['underline', 'line-through', 'overline', 'no-underline'] },
  'overline':     { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-decoration', enumAlts: ['underline', 'line-through', 'overline', 'no-underline'] },
  'no-underline': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-decoration', enumAlts: ['underline', 'line-through', 'overline', 'no-underline'] },
  'uppercase':   { category: 'typography', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'text-transform', enumAlts: ['uppercase', 'lowercase', 'capitalize', 'normal-case'] },
  'lowercase':   { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-transform', enumAlts: ['uppercase', 'lowercase', 'capitalize', 'normal-case'] },
  'capitalize':  { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-transform', enumAlts: ['uppercase', 'lowercase', 'capitalize', 'normal-case'] },
  'normal-case': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'text-transform', enumAlts: ['uppercase', 'lowercase', 'capitalize', 'normal-case'] },
  'truncate': { category: 'typography', themeKey: null, valueType: 'enum' },
  'font-sans':  { category: 'typography', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'font-family', enumAlts: ['font-sans', 'font-serif', 'font-mono'] },
  'font-serif': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'font-family', enumAlts: ['font-sans', 'font-serif', 'font-mono'] },
  'font-mono':  { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'font-family', enumAlts: ['font-sans', 'font-serif', 'font-mono'] },
  'align-baseline':    { category: 'typography', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-top':         { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-middle':      { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-bottom':      { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-text-top':    { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-text-bottom': { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-sub':         { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },
  'align-super':       { category: 'typography', themeKey: null, valueType: 'enum', propertyKey: 'vertical-align', enumAlts: ['align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super'] },

  // ─────────────────────────────────────────────────────────────
  // COLOR
  // ─────────────────────────────────────────────────────────────
  'bg-': { category: 'color', themeKey: 'colors', valueType: 'color', renderMode: 'gradient-editor', isComposite: true,
    compositeRelatedPrefixes: ['bg-', 'bg-gradient-to-', 'from-', 'via-', 'to-'] },
  'bg-gradient-to-': { category: 'gradient', themeKey: null, valueType: 'enum' },
  'from-': { category: 'gradient', themeKey: 'colors', valueType: 'color' },
  'via-': { category: 'gradient', themeKey: 'colors', valueType: 'color' },
  'to-': { category: 'gradient', themeKey: 'colors', valueType: 'color' },
  'ring-': { category: 'color', themeKey: 'colors', valueType: 'color' },
  'outline-': { category: 'color', themeKey: 'colors', valueType: 'color' },
  'fill-': { category: 'color', themeKey: 'colors', valueType: 'color' },
  'stroke-': { category: 'color', themeKey: 'colors', valueType: 'color' },
  'decoration-': { category: 'color', themeKey: 'colors', valueType: 'color' },

  // ─────────────────────────────────────────────────────────────
  // BORDERS
  // ─────────────────────────────────────────────────────────────
  'border': { category: 'borders', themeKey: 'borderWidth', valueType: 'scalar' },
  'border-': { category: 'borders', themeKey: 'borderWidth', valueType: 'scalar' },
  'border-t-': { category: 'borders', themeKey: 'borderWidth', valueType: 'scalar' },
  'border-r-': { category: 'borders', themeKey: 'borderWidth', valueType: 'scalar' },
  'border-b-': { category: 'borders', themeKey: 'borderWidth', valueType: 'scalar' },
  'border-l-': { category: 'borders', themeKey: 'borderWidth', valueType: 'scalar' },
  'rounded': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-t-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-r-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-b-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-l-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-tl-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-tr-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-br-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },
  'rounded-bl-': { category: 'borders', themeKey: 'borderRadius', valueType: 'scalar' },

  // ─────────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────────
  'opacity-': { category: 'effects', themeKey: 'opacity', valueType: 'scalar', addable: true },
  'shadow-': { category: 'effects', themeKey: null, valueType: 'enum' },

  // ─────────────────────────────────────────────────────────────
  // LAYOUT
  // ─────────────────────────────────────────────────────────────
  'block': { category: 'layout', themeKey: null, valueType: 'enum' },
  'inline-block': { category: 'layout', themeKey: null, valueType: 'enum' },
  'inline': { category: 'layout', themeKey: null, valueType: 'enum' },
  'grid': { category: 'layout', themeKey: null, valueType: 'enum' },
  'inline-grid': { category: 'layout', themeKey: null, valueType: 'enum' },
  'hidden': { category: 'layout', themeKey: null, valueType: 'enum' },
  'table': { category: 'layout', themeKey: null, valueType: 'enum' },
  'contents': { category: 'layout', themeKey: null, valueType: 'enum' },
  'static': { category: 'layout', themeKey: null, valueType: 'enum' },
  'fixed': { category: 'layout', themeKey: null, valueType: 'enum' },
  'absolute': { category: 'layout', themeKey: null, valueType: 'enum' },
  'relative': { category: 'layout', themeKey: null, valueType: 'enum' },
  'sticky': { category: 'layout', themeKey: null, valueType: 'enum' },
  'inset-': { category: 'layout', themeKey: 'spacing', valueType: 'scalar' },
  'top-': { category: 'layout', themeKey: 'spacing', valueType: 'scalar' },
  'right-': { category: 'layout', themeKey: 'spacing', valueType: 'scalar' },
  'bottom-': { category: 'layout', themeKey: 'spacing', valueType: 'scalar' },
  'left-': { category: 'layout', themeKey: 'spacing', valueType: 'scalar' },
  'z-': { category: 'layout', themeKey: null, valueType: 'enum' },

  // ─────────────────────────────────────────────────────────────
  // FLEXBOX & GRID
  // ─────────────────────────────────────────────────────────────
  'flex':        { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'flex-display',    enumAlts: ['flex', 'inline-flex'] },
  'inline-flex': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'flex-display',    enumAlts: ['flex', 'inline-flex'] },
  'flex-row':         { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'flex-direction', enumAlts: ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'] },
  'flex-col':         { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'flex-direction', enumAlts: ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'] },
  'flex-row-reverse': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'flex-direction', enumAlts: ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'] },
  'flex-col-reverse': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'flex-direction', enumAlts: ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'] },
  'flex-wrap':         { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'flex-wrap',      enumAlts: ['flex-wrap', 'flex-nowrap', 'flex-wrap-reverse'] },
  'flex-nowrap':       { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'flex-wrap',      enumAlts: ['flex-wrap', 'flex-nowrap', 'flex-wrap-reverse'] },
  'flex-wrap-reverse': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'flex-wrap',      enumAlts: ['flex-wrap', 'flex-nowrap', 'flex-wrap-reverse'] },
  'flex-1': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'flex-auto': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'flex-initial': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'flex-none': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'grow': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'grow-0': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'shrink': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'shrink-0': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'justify-start':   { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'justify-end':     { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'justify-center':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'justify-between': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'justify-around':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'justify-evenly':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'justify-stretch': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-content', enumAlts: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'] },
  'items-start':    { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'align-items', enumAlts: ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch'] },
  'items-end':      { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-items', enumAlts: ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch'] },
  'items-center':   { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-items', enumAlts: ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch'] },
  'items-baseline': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-items', enumAlts: ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch'] },
  'items-stretch':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-items', enumAlts: ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch'] },
  'content-normal':   { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-start':    { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-end':      { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-center':   { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-between':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-around':   { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-evenly':   { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-baseline': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'content-stretch':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'align-content', enumAlts: ['content-normal', 'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-baseline', 'content-stretch'] },
  'justify-items-start':   { category: 'flexbox', themeKey: null, valueType: 'enum', addable: true, propertyKey: 'justify-items', enumAlts: ['justify-items-start', 'justify-items-end', 'justify-items-center', 'justify-items-stretch'] },
  'justify-items-end':     { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-items', enumAlts: ['justify-items-start', 'justify-items-end', 'justify-items-center', 'justify-items-stretch'] },
  'justify-items-center':  { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-items', enumAlts: ['justify-items-start', 'justify-items-end', 'justify-items-center', 'justify-items-stretch'] },
  'justify-items-stretch': { category: 'flexbox', themeKey: null, valueType: 'enum',               propertyKey: 'justify-items', enumAlts: ['justify-items-start', 'justify-items-end', 'justify-items-center', 'justify-items-stretch'] },
  'self-auto': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'self-start': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'self-end': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'self-center': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'self-stretch': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'self-baseline': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'basis-': { category: 'flexbox', themeKey: 'spacing', valueType: 'scalar' },
  'grid-cols-': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'grid-rows-': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'col-span-': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'row-span-': { category: 'flexbox', themeKey: null, valueType: 'enum' },
  'order-': { category: 'flexbox', themeKey: null, valueType: 'enum' },
};

/**
 * Helper: Get the parse rule for a class token.
 * For prefix-based classes, returns the longest matching prefix rule.
 */
export function getRuleForClass(classToken: string): PropertyRule | undefined {
  // Try exact match first
  if (PROPERTY_RULES[classToken]) {
    return PROPERTY_RULES[classToken];
  }

  // Then prefix match (longest first)
  const prefixes = Object.keys(PROPERTY_RULES)
    .filter(key => key.endsWith('-') && classToken.startsWith(key))
    .sort((a, b) => b.length - a.length);

  return prefixes.length > 0 ? PROPERTY_RULES[prefixes[0]] : undefined;
}

/**
 * Helper: Build the enum groups map from PROPERTY_RULES.
 * Maps each class token to its alternatives and the canonical property key.
 */
export function buildEnumGroupsFromRules(): Record<string, { alternatives: string[]; propertyKey: string }> {
  const groups: Record<string, { alternatives: string[]; propertyKey: string }> = {};
  for (const [key, rule] of Object.entries(PROPERTY_RULES)) {
    if (rule.valueType === 'enum' && rule.enumAlts) {
      const propKey = rule.propertyKey ?? key.replace(/-$/g, '');
      for (const alt of rule.enumAlts) {
        if (!groups[alt]) {
          groups[alt] = { alternatives: rule.enumAlts, propertyKey: propKey };
        }
      }
    }
  }
  return groups;
}

/**
 * Helper: Build the addable properties map from PROPERTY_RULES.
 * Only includes entries marked addable: true, deduplicated by propertyKey.
 * Returns a map of category → AvailableProperty[].
 */
export function buildAddablePropertiesFromRules(): Record<Category, Array<{ name: string; prefixHint: string; prefix: string }>> {
  const map: Record<Category, Array<{ name: string; prefixHint: string; prefix: string }>> = {
    spacing: [], sizing: [], typography: [], color: [], borders: [], effects: [], layout: [], flexbox: [], gradient: [],
  };
  const seenPropertyKeys = new Set<string>();

  for (const [key, rule] of Object.entries(PROPERTY_RULES)) {
    if (!rule.addable) continue;
    const propKey = rule.propertyKey ?? key.replace(/-$/g, '');
    if (seenPropertyKeys.has(propKey)) continue;
    seenPropertyKeys.add(propKey);

    const humanName = propKey.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const prefixHint = rule.enumAlts
      ? rule.enumAlts.slice(0, 2).join('/') + (rule.enumAlts.length > 2 ? '/…' : '')
      : `${key}*`;

    // Use the original key (WITH trailing dash) as prefix so getScaleValues builds correct class names.
    // e.g. 'w-' → getScaleValues('w-', 'spacing', ...) → ['w-0', 'w-4', ...] (correct)
    map[rule.category].push({ name: humanName, prefixHint, prefix: key });
  }

  return map;
}

/**
 * Helper: Check if a class should be rendered by a special component (boxmodel, gradient-editor, etc).
 */
export function isCompositeRule(rule: PropertyRule | undefined): boolean {
  return rule?.isComposite ?? false;
}

/**
 * Helper: Get all prefixes that should be skipped by normal rendering because they're consumed by a composite.
 */
export function getCompositeConsumingPrefixes(): Set<string> {
  const prefixes = new Set<string>();
  for (const rule of Object.values(PROPERTY_RULES)) {
    if (rule.isComposite && rule.compositeRelatedPrefixes) {
      rule.compositeRelatedPrefixes.forEach(p => prefixes.add(p));
    }
    if (rule.isComposite && rule.compositeExactMatches) {
      rule.compositeExactMatches.forEach(m => prefixes.add(m));
    }
  }
  return prefixes;
}

/**
 * Helper: Get the render mode for a class (chip, scrubber, boxmodel, gradient-editor).
 */
export function getRenderMode(rule: PropertyRule | undefined): RenderMode {
  return rule?.renderMode ?? 'chip';
}
