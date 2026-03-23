/** CSS properties to extract from the story root element. */
const STYLE_PROPERTIES = [
  // Display & layout
  'display', 'position', 'float', 'clear',
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
  'box-shadow', 'text-decoration', 'text-transform', 'letter-spacing',
  'text-align', 'opacity',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
] as const;

export { STYLE_PROPERTIES, CHILD_STYLE_PROPERTIES };

/**
 * Read computed styles from an element.
 * Returns a plain object of property → resolved value.
 */
export function extractStyles(el: Element): Record<string, string> {
  const computed = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of STYLE_PROPERTIES) {
    styles[prop] = computed.getPropertyValue(prop);
  }
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
    if (prop === 'height') continue;
    if (prop === 'width' && containerWidth != null) {
      const px = parseFloat(value);
      // Skip if the element simply filled its container (auto width)
      if (!isNaN(px) && Math.abs(px - containerWidth) < 1) continue;
    }
    host.style.setProperty(prop, value);
  }
}

/**
 * Walk a source DOM tree and its cloned counterpart, applying computed
 * styles inline to each cloned element so it looks identical without
 * external stylesheets.
 */
export function injectChildStyles(
  sourceEl: Element | null,
  cloneEl: Element | null,
): void {
  if (!sourceEl || !cloneEl) return;

  const computed = (sourceEl.ownerDocument.defaultView ?? window).getComputedStyle(sourceEl);
  const clone = cloneEl as HTMLElement;
  if (clone.style) {
    for (const prop of CHILD_STYLE_PROPERTIES) {
      clone.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }

  const sourceChildren = sourceEl.children;
  const cloneChildren = cloneEl.children;
  const len = Math.min(sourceChildren.length, cloneChildren.length);
  for (let i = 0; i < len; i++) {
    injectChildStyles(sourceChildren[i], cloneChildren[i]);
  }
}
