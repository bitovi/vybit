# 023 — Adaptive Iframe: Ghost Element + Iframe Overlay

## Overview

A Web Component (`<adaptive-iframe>`) that embeds a Storybook story iframe so it participates
naturally in the host page's layout — matching the display, dimensions, and visual appearance
of the story's root element. A visible "ghost" clone drives layout flow; the iframe fades in
on top once loaded.

The component lives in `overlay/src/` so both the panel and the overlay can import it (the
panel already imports extensively from `overlay/src/`). It's a vanilla Web Component — not
React — so it works in any environment: the panel, the overlay, or an arbitrary host page.

---

## Problem

The Draw tab currently renders Storybook stories in `<iframe>`s that are always block-level,
full-width containers with a hardcoded 160 px initial height and a ResizeObserver that
adjusts height to `body.scrollHeight`. This works for height but:

- The iframe is always `display: block; width: 100%` regardless of the story content's
  natural display mode (e.g. an inline `<span>` badge still gets a full-width block iframe)
- In a future "draw with components" flow, users drag story components onto a canvas. These
  iframes must flow like real elements — an inline badge should sit inline, a flex child
  should size like a flex child, etc.
- The iframe's chrome (border, margin, padding) doesn't match the story content, creating
  visual seams

### The Ghost Approach

Instead of fighting iframe layout limitations, we reconstruct the story element's appearance
*outside* the iframe as a "ghost" that participates in normal document flow:

1. Load the iframe hidden/offscreen (purely for style extraction)
2. Read the story root element's computed styles via `getComputedStyle()`
3. Clone the element's HTML and styles into a shadow DOM inside the Web Component
4. Apply layout-driving styles (display, width, height, margin, etc.) to the host element
5. The ghost is visible and drives layout — it *is* the element from the browser's perspective
6. Once ready, position the real iframe as an overlay on top of the ghost and fade it in
7. The user sees and interacts with the iframe; the ghost remains underneath as the layout spacer

---

## Goals

- Build an `<adaptive-iframe>` Web Component that renders a full visual clone (ghost) of
  the iframe's root element, with correct layout flow in the host page
- Support both `src` (URL) and `srcdoc` (inline HTML) attributes
- Ghost-first development: ghost works and is verifiable before the iframe overlay is added
- Testable in Storybook with `srcdoc` — no running Storybook server needed for basic tests
- Reusable across panel and overlay (lives in `overlay/src/`)

## Non-Goals

- Cross-origin iframe support (v1 uses same-origin via `/storybook` proxy; postMessage deferred)
- Parent/sibling context reconstruction (v1 mirrors root element styles only; v2 may inject
  parent DOM context to handle flex/grid child positioning)
- Replacing `StoryRow` (integration is a separate task — this spec builds the component only)

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Component type | Web Component (vanilla) | Works in panel, overlay, and any host page — no React dependency |
| Code location | `overlay/src/adaptive-iframe/` | Panel already imports from `overlay/src/`; keeps shared browser code together |
| Same-origin only (v1) | Yes — proxy-based | `contentDocument` access is reliable and simpler than postMessage |
| Parent context reconstruction | Deferred to v2 | Root-element-only cloning covers most Storybook stories; parent injection adds significant complexity |
| Inline elements | `inline-block` on host | CSS ignores width/height on true `inline`; `inline-block` is functionally identical for single-box Storybook components |
| Ghost visibility | Visible as loading placeholder | Ghost shows immediately with correct appearance; iframe fades in on top |
| Testing strategy | `srcdoc` + panel Storybook | `srcdoc` iframes are same-origin by default — no server needed; visual testing via Storybook stories |
| Development order | Ghost first, then iframe overlay | Allows verifying layout fidelity before adding overlay complexity |

---

## Architecture

```
<adaptive-iframe src="..." srcdoc="...">
  Host element (the "ghost")
  ├── display / box-model / visual styles cloned from story root
  ├── participates in host page document flow
  │
  └── #shadow-root
      ├── <style>         (scoped styles for ghost content)
      ├── <div class="ghost">
      │     cloned innerHTML + computed child styles
      └── <iframe>        (Phase 2: absolute overlay, fades in)
            position: absolute; inset: 0
            opacity: 0 → 1 on load
```

### Key Insight

The Web Component's **host element IS the ghost**. By setting computed styles directly on the
host (`this.style.display = ...`, `this.style.width = ...`), the custom element participates
in the host page's layout exactly as the story element would. The shadow DOM holds the cloned
visual content (for the placeholder appearance) and eventually the iframe overlay.

---

## File Structure

```
overlay/src/adaptive-iframe/
  index.ts               ← re-export + customElements.define('adaptive-iframe', ...)
  adaptive-iframe.ts     ← Web Component class
  style-cloner.ts        ← extractStyles() + applyStylesToHost() utilities
  style-cloner.test.ts   ← Vitest unit tests for style extraction

panel/src/components/AdaptiveIframe/
  index.ts               ← re-export
  AdaptiveIframe.stories.tsx  ← Storybook stories for visual testing
```

The `.stories.tsx` file lives in `panel/src/components/` so the panel Storybook glob
(`../src/**/*.stories.*`) discovers it. It imports the Web Component from
`../../../../overlay/src/adaptive-iframe`.

---

## Implementation

### Phase 1 — Style Cloner + Ghost (no iframe overlay)

**Goal:** The `<adaptive-iframe>` renders a visible ghost that matches the story content's
appearance and flows correctly in any layout context.

#### 1. `style-cloner.ts`

```ts
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
  'border-radius', // shorthand resolved by getComputedStyle
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'opacity',
  'text-decoration', 'text-transform',
  // Spacing & text
  'line-height', 'letter-spacing', 'word-spacing', 'text-align',
] as const;

/**
 * Read computed styles from an element.
 * Returns a plain object of property → resolved-value.
 */
export function extractStyles(el: Element): Record<string, string> {
  const computed = getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of STYLE_PROPERTIES) {
    styles[prop] = computed.getPropertyValue(prop);
  }
  return styles;
}

/**
 * Apply extracted styles directly to a host element's inline style.
 * Handles the inline → inline-block promotion (CSS ignores width/height on
 * true inline; inline-block is functionally identical for single-box components).
 */
export function applyStylesToHost(
  host: HTMLElement,
  styles: Record<string, string>,
): void {
  for (const [prop, value] of Object.entries(styles)) {
    if (prop === 'display' && value === 'inline') {
      host.style.setProperty('display', 'inline-block');
    } else {
      host.style.setProperty(prop, value);
    }
  }
}
```

#### 2. `adaptive-iframe.ts` — Web Component (Phase 1: ghost only)

```ts
import { extractStyles, applyStylesToHost } from './style-cloner';

export class AdaptiveIframe extends HTMLElement {
  static observedAttributes = ['src', 'srcdoc'];

  private shadow: ShadowRoot;
  private ghostEl: HTMLDivElement;
  private hiddenIframe: HTMLIFrameElement;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });

    // Ghost content container (visible — the placeholder)
    this.ghostEl = document.createElement('div');
    this.ghostEl.setAttribute('part', 'ghost');

    // Scoped styles for the ghost + (future) iframe
    const style = document.createElement('style');
    style.textContent = `
      :host { /* no default styles — driven by applyStylesToHost */ }
      .ghost { /* inherits from host */ }
      iframe {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        border: none;
        opacity: 0;
        transition: opacity 0.2s ease-in;
        pointer-events: none;  /* Phase 1: hidden */
      }
      iframe.visible {
        opacity: 1;
        pointer-events: auto;
      }
    `;
    this.shadow.append(style, this.ghostEl);

    // Hidden iframe for style extraction (offscreen, not in shadow DOM)
    this.hiddenIframe = document.createElement('iframe');
    Object.assign(this.hiddenIframe.style, {
      position: 'fixed', left: '-9999px', top: '-9999px',
      width: '0', height: '0',
      visibility: 'hidden', pointerEvents: 'none',
    });
    this.hiddenIframe.addEventListener('load', () => this.onIframeLoad());
  }

  connectedCallback() {
    // Append hidden iframe to document body (not shadow DOM) so it loads
    document.body.appendChild(this.hiddenIframe);
    this.triggerLoad();
  }

  disconnectedCallback() {
    this.hiddenIframe.remove();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.triggerLoad();
  }

  private triggerLoad() {
    const src = this.getAttribute('src');
    const srcdoc = this.getAttribute('srcdoc');
    if (srcdoc) {
      this.hiddenIframe.srcdoc = srcdoc;
    } else if (src) {
      this.hiddenIframe.src = src;
    }
  }

  private onIframeLoad() {
    const doc = this.hiddenIframe.contentDocument;
    if (!doc) return;

    // Strip body/html margin/padding (same pattern as StoryRow)
    const resetStyle = doc.createElement('style');
    resetStyle.textContent =
      'body,html{margin:0!important;padding:0!important}';
    doc.head.appendChild(resetStyle);

    // Find the story root element
    const root =
      doc.querySelector('#storybook-root > *') ??
      doc.body.firstElementChild;
    if (!root) return;

    // Extract computed styles from story root
    const styles = extractStyles(root);

    // Apply layout + visual styles to host element (drives document flow)
    applyStylesToHost(this, styles);

    // Clone the story content into the ghost
    this.ghostEl.innerHTML = root.outerHTML;

    // Also extract and scope computed styles for all child elements
    // so the ghost clone looks visually identical
    this.injectChildStyles(root, this.ghostEl.firstElementChild);
  }

  /**
   * Walk the cloned DOM tree and apply computed styles inline.
   * This ensures the ghost looks identical to the iframe content
   * without needing to clone external stylesheets.
   */
  private injectChildStyles(
    sourceEl: Element | null,
    cloneEl: Element | null,
  ) {
    if (!sourceEl || !cloneEl) return;

    const computed = getComputedStyle(sourceEl);
    const clone = cloneEl as HTMLElement;
    if (clone.style) {
      // Apply a subset of visual properties to each child
      for (const prop of ['color', 'font-family', 'font-size', 'font-weight',
        'font-style', 'line-height', 'background-color', 'background-image',
        'border-radius', 'padding', 'margin', 'display', 'width', 'height',
        'box-shadow', 'text-decoration', 'text-transform', 'letter-spacing',
        'text-align', 'opacity', 'border',
      ]) {
        clone.style.setProperty(prop, computed.getPropertyValue(prop));
      }
    }

    // Recurse into children
    const sourceChildren = sourceEl.children;
    const cloneChildren = cloneEl.children;
    const len = Math.min(sourceChildren.length, cloneChildren.length);
    for (let i = 0; i < len; i++) {
      this.injectChildStyles(sourceChildren[i], cloneChildren[i]);
    }
  }
}
```

#### 3. `index.ts`

```ts
export { AdaptiveIframe } from './adaptive-iframe';
export { extractStyles, applyStylesToHost } from './style-cloner';

import { AdaptiveIframe } from './adaptive-iframe';

if (!customElements.get('adaptive-iframe')) {
  customElements.define('adaptive-iframe', AdaptiveIframe);
}
```

#### 4. Unit Tests — `style-cloner.test.ts`

Test `extractStyles()` with a mock element whose `getComputedStyle()` returns known values.
Test `applyStylesToHost()` sets properties on the host, including the `inline` → `inline-block`
promotion. These tests run in jsdom (no real iframe needed).

#### 5. Storybook Stories — `AdaptiveIframe.stories.tsx`

Stories use `srcdoc` with self-contained HTML so they work without a running Storybook server.

- **Block Element** — A card-like `<div>` with background, border-radius, padding, text.
  Verify ghost takes block flow, matches card dimensions.
- **Inline Element** — A badge-like `<span>` inside a `<p>` with surrounding text.
  Verify ghost sits inline (as inline-block) alongside the text.
- **Inline-Block Element** — A `<button>` with border, padding, font styling.
  Verify ghost matches button appearance and sits inline-block.
- **Multiple in Flex** — Several `<adaptive-iframe>` in a `display: flex` container.
  Verify they lay out as flex children with correct sizes.
- **Nested Content** — A `<div>` with child elements (heading, paragraph, nested spans).
  Verify child styles are cloned into the ghost correctly.

Each story wraps the component in a realistic layout context to test flow behavior.

### ✅ Phase 1 Checkpoint

Verify in panel Storybook (port 6006) before proceeding:
- Ghost visually matches the `srcdoc` content (colors, fonts, borders, sizes)
- Ghost flows correctly in layout (block takes full width, inline sits inline with text)
- Ghost dimensions match what the real element would occupy in that layout context

---

### Phase 2 — Iframe Overlay

**Goal:** The real iframe is visible and interactive, positioned exactly on top of the ghost.
The ghost remains underneath as the layout spacer.

#### 6. Show the iframe as an overlay

Move the iframe from the hidden offscreen position into the shadow DOM:

```ts
// In onIframeLoad(), after ghost is built:
this.style.position = 'relative';          // host is positioning context
this.hiddenIframe.remove();                // remove from body
this.shadow.appendChild(this.hiddenIframe); // add to shadow DOM
// Iframe CSS (from shadow <style>) handles position: absolute; inset: 0
this.hiddenIframe.classList.add('visible'); // triggers opacity transition
```

Strip the offscreen positioning styles, let the shadow `<style>` block take over.

The iframe now overlays the ghost. The user sees and interacts with the iframe; the ghost
drives the layout dimensions underneath.

#### 7. Handle `display: inline`

When the story root's computed display is `inline`, set the host to `inline-block`. CSS
ignores explicit `width`/`height` on `inline` elements, which would break the overlay
positioning. `inline-block` is functionally identical for single-box Storybook components.

Already handled in `applyStylesToHost()`.

#### 8. ResizeObserver — continuous sync

```ts
private observer: ResizeObserver | null = null;

private setupResizeObserver(doc: Document, root: Element) {
  this.observer?.disconnect();
  this.observer = new ResizeObserver(() => {
    const styles = extractStyles(root);
    this.style.width = styles['width'];
    this.style.height = styles['height'];
  });
  this.observer.observe(doc.body);
}
```

Observe `iframe.contentDocument.body`. On resize, re-read story root dimensions and update
host `width`/`height`. Also handles the host element itself — if the host page container
resizes, the ghost adapts naturally (it's in normal flow) and the iframe overlay follows.

#### 9. Storybook stories with real URLs

Add stories that use `src` pointing at actual Storybook story URLs:
```ts
src="/storybook/iframe.html?id=components-scale-scrubber--spacing"
```
These require the panel Storybook + server to be running. They demonstrate the full pipeline:
proxy → iframe load → style extraction → ghost → overlay.

### ✅ Phase 2 Checkpoint

- Iframe fades in smoothly over the ghost — no visual jump or flicker
- Iframe is interactive (hover, click events work)
- Resizing the Storybook viewport causes ghost + iframe to stay in sync
- Real Storybook story URL renders correctly

---

### Phase 3 — Refinements

#### 10. Edge cases

- **Iframe load failure:** Ghost stays visible as fallback. Optionally show a border/icon
  indicating the iframe didn't load.
- **No story root found:** Fall back to fixed dimensions (e.g. 200×100) with a "?" placeholder.
- **Animated content:** Debounce ResizeObserver callbacks to avoid layout thrashing.
- **Multiple instances:** Each `<adaptive-iframe>` is fully independent — no shared state.
- **Cleanup:** `disconnectedCallback()` removes the hidden iframe from `document.body` and
  disconnects the ResizeObserver.

---

## Testing Strategy

### Unit Tests (Vitest + jsdom)

| Test | File | What |
|---|---|---|
| `extractStyles` returns all properties | `style-cloner.test.ts` | Mock element, verify Record keys |
| `applyStylesToHost` sets inline styles | `style-cloner.test.ts` | Verify `el.style.getPropertyValue()` |
| `inline` → `inline-block` promotion | `style-cloner.test.ts` | Verify display override |

### Visual Tests (Storybook)

`srcdoc` stories in panel Storybook — no external dependencies. Each story tests a different
display mode and layout context.

| Story | Display | Layout Context | Verifies |
|---|---|---|---|
| Block Element | block | standalone | Width fills container, height = content |
| Inline Element | inline→inline-block | inside `<p>` text | Sits inline with text |
| Inline-Block Element | inline-block | standalone | Button-like sizing |
| Multiple in Flex | various | flex container | Flex child sizing |
| Nested Content | block | standalone | Child style cloning |

### Manual Testing

1. Start panel Storybook (port 6006) + server (port 3333)
2. Navigate to AdaptiveIframe stories
3. Phase 1: Verify ghost appearance and flow
4. Phase 2: Verify iframe overlay, interaction, resize sync
5. Point at real story URLs and verify full pipeline

---

## Future Work (v2)

- **Parent context reconstruction:** Clone the story element's parent and sibling HTML +
  styles into the ghost, so the ghost behaves like a flex/grid child within a reconstructed
  layout context. Challenge: scrolling the iframe to the correct offset within the
  reconstructed parent.
- **Cross-origin support:** Use `postMessage` from a Storybook addon (spec 022) to send
  computed styles and HTML to the parent, instead of relying on `contentDocument`.
- **Integration with StoryRow:** Replace StoryRow's current iframe logic with
  `<adaptive-iframe>`, giving the Draw tab seamless story embedding.
- **Integration with overlay:** Use `<adaptive-iframe>` in the component-draw flow so
  dragged-in story components flow naturally in the user's app.
