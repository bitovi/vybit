/** CSS properties to extract from the story root element.
 *  Kept for reference / documentation — extractStyles() now extracts
 *  all non-default properties automatically via baseline comparison. */
const STYLE_PROPERTIES = [
  // Display & layout
  'display', 'position', 'float', 'clear',
  // Flex & grid layout
  'flex-direction', 'flex-wrap', 'align-items', 'justify-content',
  'align-content', 'gap', 'row-gap', 'column-gap',
  // Box model
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'box-sizing',
  // Visual
  'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'opacity',
  'text-decoration', 'text-transform',
  // Spacing & text
  'line-height', 'letter-spacing', 'word-spacing', 'text-align',
] as const;

/** Properties to inline on cloned child elements for visual fidelity.
 *  Excludes width/height — children should size naturally in the host context. */
const CHILD_STYLE_PROPERTIES = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'background-color', 'background-image',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'display',
  'flex-direction', 'flex-wrap', 'align-items', 'justify-content',
  'align-content', 'gap', 'row-gap', 'column-gap',
  'box-shadow', 'text-decoration', 'text-transform', 'letter-spacing',
  'text-align', 'opacity',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
] as const;

export { STYLE_PROPERTIES, CHILD_STYLE_PROPERTIES };

/**
 * Inherited CSS properties that must always be extracted even if they match
 * the baseline.  The baseline element inherits from the source document
 * (e.g. Storybook's white-background page) but the host renders in a
 * different context (the dark-themed panel), so inherited values would be
 * wrong if omitted.
 */
const ALWAYS_EXTRACT = new Set([
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration',
]);

/**
 * Extract only the non-default computed styles from an element by comparing
 * against a bare baseline element of the same tag.  This captures every
 * property that was explicitly set (by stylesheets, inheritance from styled
 * ancestors, etc.) without needing a hand-maintained allowlist, and produces
 * a minimal set of inline styles.
 *
 * Inherited properties in ALWAYS_EXTRACT are included even if they match
 * the baseline, because the host element lives in a different document
 * context where inherited values differ.
 */
export function extractStyles(el: Element): Record<string, string> {
  const win = el.ownerDocument.defaultView ?? window;
  const doc = el.ownerDocument;
  const computed = win.getComputedStyle(el);

  // Create a baseline element of the same tag to discover browser defaults.
  // Append it off-screen so computed styles resolve, then compare.
  const baseline = doc.createElement(el.tagName.toLowerCase());
  baseline.style.position = 'absolute';
  baseline.style.visibility = 'hidden';
  baseline.style.pointerEvents = 'none';
  (doc.body ?? doc.documentElement).appendChild(baseline);
  const baselineComputed = win.getComputedStyle(baseline);

  const styles: Record<string, string> = {};
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    const value = computed.getPropertyValue(prop);
    if (ALWAYS_EXTRACT.has(prop) || value !== baselineComputed.getPropertyValue(prop)) {
      styles[prop] = value;
    }
  }

  baseline.remove();
  return styles;
}

/**
 * Apply extracted styles to a host element's inline style.
 *
 * Skips `height` so the ghost's cloned content drives height naturally.
 * Skips `width` when its computed value matches the container width —
 * this means the element auto-expanded to fill its parent (normal block
 * behaviour) and the host element will do the same naturally.  Elements
 * with an explicit width (e.g. `width: 240px`) are preserved.
 */
export function applyStylesToHost(
  host: HTMLElement,
  styles: Record<string, string>,
  containerWidth?: number,
): void {
  for (const [prop, value] of Object.entries(styles)) {
    // Skip height / block-size so ghost content drives height naturally
    if (prop === 'height' || prop === 'block-size') continue;
    // Skip width / inline-size when the element simply filled its container
    if ((prop === 'width' || prop === 'inline-size') && containerWidth != null) {
      const px = parseFloat(value);
      if (!isNaN(px) && Math.abs(px - containerWidth) < 1) continue;
    }
    // Skip geometry-derived properties that cause style thrashing
    if (prop === 'perspective-origin' || prop === 'transform-origin') continue;
    host.style.setProperty(prop, value);
  }
}

/**
 * Walk a source DOM tree and its cloned counterpart, applying only
 * non-default computed styles inline to each cloned element.  Uses
 * the same baseline-comparison technique as extractStyles() so no
 * hand-maintained property list is needed.
 *
 * Caches baseline computed styles per tag name to avoid creating a
 * new baseline element for every node in the tree.
 */
/** Properties to always skip on child elements — they should size naturally
 *  in the host context, and geometry-derived values cause thrashing. */
const SKIP_CHILD_PROPS = new Set([
  'width', 'height', 'inline-size', 'block-size',
  'perspective-origin', 'transform-origin',
]);

export function injectChildStyles(
  sourceEl: Element | null,
  cloneEl: Element | null,
): void {
  if (!sourceEl || !cloneEl) return;

  const win = sourceEl.ownerDocument.defaultView ?? window;
  const doc = sourceEl.ownerDocument;
  const container = doc.body ?? doc.documentElement;

  // Per-tag cache of baseline property values — survives the entire tree walk
  const baselineCache = new Map<string, Map<string, string>>();

  function getBaseline(tag: string): Map<string, string> {
    let cached = baselineCache.get(tag);
    if (cached) return cached;

    const el = doc.createElement(tag);
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
    container.appendChild(el);
    const computed = win.getComputedStyle(el);

    cached = new Map<string, string>();
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      cached.set(prop, computed.getPropertyValue(prop));
    }
    el.remove();
    baselineCache.set(tag, cached);
    return cached;
  }

  function walk(source: Element, clone: Element): void {
    const computed = win.getComputedStyle(source);
    const cloneHtml = clone as HTMLElement;

    if (cloneHtml.style) {
      const baseline = getBaseline(source.tagName.toLowerCase());
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        // Skip sizing props on children — they should size naturally
        if (SKIP_CHILD_PROPS.has(prop)) continue;
        const value = computed.getPropertyValue(prop);
        if (value !== (baseline.get(prop) ?? '')) {
          cloneHtml.style.setProperty(prop, value);
        }
      }
    }

    const sourceChildren = source.children;
    const cloneChildren = clone.children;
    const len = Math.min(sourceChildren.length, cloneChildren.length);
    for (let i = 0; i < len; i++) {
      walk(sourceChildren[i], cloneChildren[i]);
    }
  }

  walk(sourceEl, cloneEl);
}
