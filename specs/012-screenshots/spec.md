# Screenshot Capture & Annotate — Requirements

## Overview

Capture a screenshot of the selected element (or the bounding region of all selected instances) and open it as a background image in the inline drawing canvas. Users can annotate, circle, arrow, and sketch on top of the screenshot to communicate visual feedback to an AI agent.

## Motivation

The existing drawing canvas starts with a blank white background, which works well for sketching new UI from scratch. But often users want to annotate *existing* UI — circle a misaligned element, arrow to where something should move, draw a proposed change on top of the current layout. By capturing a screenshot of the selected element(s) and loading it as a locked background in the canvas, we bridge the gap between "what's there now" and "what I want changed."

## Vocabulary

| Term | Definition |
|------|-----------|
| **Screenshot Capture** | A DOM-to-PNG operation that uses `html2canvas` to render the selected element's bounding region into a base64 PNG data URL. Runs in the overlay (which has direct access to the user's page DOM). |
| **Union Bounding Box** | When multiple element instances are selected, the smallest axis-aligned rectangle that contains all of their `getBoundingClientRect()` results. Used as the capture region. |
| **Background Image** | The screenshot PNG loaded into the Fabric.js canvas as a non-selectable, non-movable image layer behind all drawn objects. Users annotate *on top of* the screenshot. |
| **Annotation** | Any drawn object (freehand stroke, shape, arrow, text) placed on top of the background image. Exported together with the background as a single composite PNG. |

---

## User Flow

```
1. User clicks element in the page
      │
      ▼
2. Panel shows Picker UI with Draw tab
      │
      ▼
3. User switches to the Draw tab
      │  └── sees existing "Insert Drawing Canvas" buttons
      │  └── sees NEW "Screenshot & Annotate" button
      ▼
4. User clicks "Screenshot & Annotate"
      │  └── panel sends CAPTURE_SCREENSHOT (no insertMode) → overlay
      ▼
5. Overlay validates that currentEquivalentNodes are all siblings
      │  └── if not siblings: shows toast error and aborts
      │  └── if siblings: proceeds
      ▼
6. Overlay hides highlight overlays temporarily
      │  └── computes union bounding box of currentEquivalentNodes
      │  └── calls html2canvas to capture the region as PNG
      │  └── restores highlight overlays
      ▼
7. Overlay replaces selected elements with Canvas Wrapper
      │  └── removes all currentEquivalentNodes from the DOM
      │  └── inserts wrapper + iframe (pointing to /panel/?mode=design)
      │      at the position of the first removed element
      │  └── on iframe load, sends ELEMENT_CONTEXT with screenshot field
      ▼
8. Design iframe receives ELEMENT_CONTEXT (with screenshot)
      │  └── passes screenshot as backgroundImage prop to DesignCanvas
      ▼
9. Canvas renders with screenshot as locked background
      │  └── canvas dimensions match the screenshot
      │  └── user draws annotations on top
      ▼
10. User clicks "Queue as Change"
       │  └── Fabric.js toDataURL() captures composite (background + annotations)
       │  └── design iframe sends DESIGN_SUBMIT → server (same as existing flow)
       ▼
11. Server queues the annotated screenshot as a design patch
```

---

## Architecture

### Capture Strategy: html2canvas in the Overlay

The screenshot is captured in the overlay layer, not the panel, because the overlay has direct DOM access to the user's page. The capture flow:

1. **Validate siblings** — confirm all `currentEquivalentNodes` share the same `parentElement`; if not, show a toast and abort
2. **Temporarily hide overlay UI** — highlight overlays, toolbars, and design canvas wrappers are hidden to get a clean screenshot of the page content only
3. **Compute capture region** — union bounding box of all `currentEquivalentNodes`
4. **Call html2canvas** — renders the page region to a `<canvas>` element, then exports as PNG data URL
5. **Restore overlay UI** — highlights and toolbars reappear
6. **Replace elements in the DOM** — remove all `currentEquivalentNodes` from the DOM, then insert the canvas wrapper at the position the first node occupied (using `insertAdjacentElement('beforebegin', wrapper)` before removal)
7. **Pass screenshot via WebSocket** — included in the `ELEMENT_CONTEXT` message as a new `screenshot` field

### Why html2canvas

| Criterion | html2canvas | html-to-image | Native `element.getScreenshot()` |
|-----------|------------|---------------|----------------------------------|
| Region capture | ✅ Supports `x`, `y`, `width`, `height` options for arbitrary regions | ❌ Single element only | ❌ Does not exist |
| Multi-element union box | ✅ Capture `document.body` with region clipping | ❌ Would need wrapper element | N/A |
| Bundle size | ~40KB gzipped | ~8KB gzipped | 0 |
| Cross-origin images | ✅ `useCORS: true` option | ✅ Similar option | N/A |
| Shadow DOM | ⚠️ Limited (won't render shadow roots) — but overlay UI is in shadow DOM, so this is *desired* | ⚠️ Same limitation | N/A |
| Maturity | Very mature (10+ years, 25K+ GitHub stars) | Newer, lighter | N/A |

`html2canvas` is the right choice: it supports region-based capture needed for multi-element screenshots, and its shadow DOM limitation is actually a benefit (the overlay UI won't appear in screenshots).

---

## Message Types

### New Message: `CAPTURE_SCREENSHOT`

Sent from panel → overlay when user clicks the "Screenshot & Annotate" button:

```ts
interface CaptureScreenshotMessage {
  type: 'CAPTURE_SCREENSHOT';
  // No insertMode — the overlay always replaces the selected elements
}
```

### Extended Message: `ELEMENT_CONTEXT`

The existing `ElementContextMessage` gains an optional `screenshot` field. The `insertMode` is set to `'replace'` (a new value added to `InsertMode`) to signal to the design iframe that the canvas is standing in for elements that were removed:

```ts
interface ElementContextMessage {
  type: 'ELEMENT_CONTEXT';
  componentName: string;
  instanceCount: number;
  target: { tag: string; classes: string; innerText: string };
  context: string;
  insertMode: InsertMode;  // 'replace' when screenshot flow is used
  screenshot?: string;      // NEW — base64 PNG data URL of the captured region
}
```

`InsertMode` gains a new value:

```ts
type InsertMode = 'before' | 'after' | 'first-child' | 'last-child' | 'replace';
```

When `screenshot` is present, the design canvas renders it as a locked background image. When absent (standard draw flow), the canvas uses a white background as before.

### Message Flow Diagram

```
  Panel                    Overlay                   Design iframe           Server
    │                        │                           │                     │
    │  CAPTURE_SCREENSHOT    │                           │                     │
    │                        │                           │                     │
    │───────────────────────>│                           │                     │
    │                        │── validate siblings       │                     │
    │                        │── hide highlights         │                     │
    │                        │── html2canvas(region)     │                     │
    │                        │── restore highlights      │                     │
    │                        │── remove selected nodes ──│                     │
    │                        │── insert wrapper+iframe ──│                     │
    │                        │                           │                     │
    │                        │   ELEMENT_CONTEXT         │                     │
    │                        │   { ..., screenshot,      │                     │
    │                        │     insertMode:'replace' }│                     │
    │                        │──────────────────────────>│                     │
    │                        │                           │                     │
    │                        │                           │  DesignCanvas       │
    │                        │                           │  (bg = screenshot)  │
    │                        │                           │  (user annotates)   │
    │                        │                           │                     │
    │                        │                           │   DESIGN_SUBMIT     │
    │                        │                           │   { image, ... }    │
    │                        │                           │────────────────────>│
    │                        │                           │                     │── queue
```

---

## Screenshot Capture Module

### New File: `overlay/src/screenshot.ts`

```ts
import html2canvas from 'html2canvas';

/**
 * Compute the union bounding box of one or more elements.
 */
function unionBoundingBox(nodes: HTMLElement[]): DOMRect {
  let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    bottom = Math.max(bottom, rect.bottom);
    right = Math.max(right, rect.right);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Returns true if all nodes share the same parentElement (are siblings).
 */
export function areSiblings(nodes: HTMLElement[]): boolean {
  if (nodes.length === 0) return false;
  const parent = nodes[0].parentElement;
  return nodes.every((n) => n.parentElement === parent);
}

/**
 * Capture a region of the page as a PNG data URL.
 * Hides overlay artifacts before capture and restores them afterward.
 */
export async function captureRegion(
  nodes: HTMLElement[],
  hideElements?: HTMLElement[]
): Promise<string> {
  const region = unionBoundingBox(nodes);

  // Temporarily hide overlay artifacts
  const hidden: { el: HTMLElement; prev: string }[] = [];
  for (const el of hideElements ?? []) {
    hidden.push({ el, prev: el.style.display });
    el.style.display = 'none';
  }

  try {
    const canvas = await html2canvas(document.body, {
      x: region.x + window.scrollX,
      y: region.y + window.scrollY,
      width: region.width,
      height: region.height,
      useCORS: true,
      ignoreElements: (el) =>
        el.hasAttribute?.('data-tw-design-canvas') ||
        el.hasAttribute?.('data-tw-overlay'),
    });
    return canvas.toDataURL('image/png');
  } finally {
    // Restore hidden elements
    for (const { el, prev } of hidden) {
      el.style.display = prev;
    }
  }
}
```

### Capture Cleanup

Before running `html2canvas`, the overlay must hide:

| Element | Selector / Identifier | Reason |
|---------|----------------------|--------|
| Highlight overlays | `.highlight-overlay` class on body | Teal/orange pulsing outlines should not appear in screenshot |
| Overlay toolbar | Elements inside shadow DOM host | Shadow DOM content is already invisible to html2canvas |
| Design canvas wrappers | `[data-tw-design-canvas]` | Previous canvas injections should not appear |

The `ignoreElements` callback and the temporary `display: none` on highlight overlays handle this.

---

## DrawTab UI Changes

### New Section: "Screenshot & Annotate"

Added below the existing "Insert Drawing Canvas" section in `DrawTab.tsx`:

```
┌─────────────────────────────────────────────┐
│  Insert a drawing canvas into the page...   │  ← existing description
│                                             │
│  INSERT DRAWING CANVAS                      │  ← existing heading
│  ┌──────────────┐  ┌──────────────┐        │
│  │ ↑ Before     │  │ ↓ After      │        │  ← existing buttons
│  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ ⤒ First child│  │ ⤓ Last child │        │
│  └──────────────┘  └──────────────┘        │
│                                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ← visual separator
│                                             │
│  SCREENSHOT & ANNOTATE                      │  ← new heading
│  Capture the selected element(s) and        │
│  annotate in the drawing canvas. The        │
│  selected elements will be replaced by the  │
│  canvas. All selected elements must be      │
│  siblings in the DOM.                       │
│                                             │
│  ┌────────────────────────────────────┐     │
│  │ 📷 Screenshot & Annotate           │     │  ← single new button (full-width)
│  └────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

The new button sends `CAPTURE_SCREENSHOT` with no insertion mode:

```ts
sendTo('overlay', {
  type: 'CAPTURE_SCREENSHOT',
});
```

---

## DesignCanvas Background Image Support

### New Prop: `backgroundImage`

```ts
interface DesignCanvasProps {
  onSubmit: (imageDataUrl: string, width: number, height: number) => void;
  onClose?: () => void;
  backgroundImage?: string;  // NEW — base64 PNG data URL to use as locked background
}
```

### Fabric.js Background Loading

In `useFabricCanvas.ts`, when `backgroundImage` is provided:

```ts
import { FabricImage } from 'fabric';

// After canvas initialization:
if (backgroundImage) {
  const img = await FabricImage.fromURL(backgroundImage);
  canvas.setDimensions({ width: img.width!, height: img.height! });
  canvas.backgroundImage = img;
  canvas.renderAll();
}
```

### Behavior Rules

| Scenario | Background | Canvas Size |
|----------|-----------|-------------|
| Standard draw (no screenshot) | White `#ffffff` | Container width × 400px (default) |
| Screenshot & Annotate | Screenshot PNG (locked) | Matches screenshot dimensions |
| Clear canvas (with screenshot) | Screenshot restored (not cleared) | Unchanged |
| Clear canvas (no screenshot) | White `#ffffff` restored | Unchanged |
| Submit (toDataURL) | Composite: background + annotations | N/A |

The background image is:
- **Not selectable** — cannot be clicked, moved, or resized
- **Not erasable** — the eraser tool only affects drawn objects
- **Always behind** — drawn objects layer on top
- **Included in export** — `canvas.toDataURL()` captures background + annotations as a single composite PNG

---

## Threading: DesignMode → DesignCanvas

In `DesignMode.tsx`, extract `screenshot` from the `ELEMENT_CONTEXT` message:

```ts
if (msg.type === 'ELEMENT_CONTEXT') {
  setElementContext({
    componentName: msg.componentName,
    instanceCount: msg.instanceCount,
    target: msg.target,
    context: msg.context,
    insertMode: msg.insertMode ?? 'after',
    screenshot: msg.screenshot,       // NEW
  });
}
```

Then pass to `DesignCanvas`:

```ts
<DesignCanvas
  onSubmit={handleSubmit}
  onClose={handleClose}
  backgroundImage={elementContext?.screenshot}
/>
```

---

## Multi-Element Capture

When the user has selected a component with multiple instances (e.g., 3 cards in a row), all instances must be siblings in the DOM. The screenshot captures the **union bounding box** — the smallest rectangle that contains all selected instances — and the canvas wrapper replaces all of them in their shared parent.

```
┌─────────────────────────────── page ──────────────────────────────┐
│                                                                    │
│  ┌── Card 1 ──┐  ┌── Card 2 ──┐  ┌── Card 3 ──┐                 │
│  │  ■ Title   │  │  ■ Title   │  │  ■ Title   │                 │
│  │  body text │  │  body text │  │  body text │                 │
│  └────────────┘  └────────────┘  └────────────┘                 │
│        │                │                │                        │
│        └────── all siblings in parent ───┘                        │
│                                                                    │
│  ◄──────────── union bounding box (screenshot) ────────────►       │
│                  ↓ replaced by canvas wrapper ↓                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                    Drawing Canvas                         │     │
│  └──────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

### Algorithm

1. Validate all `currentEquivalentNodes` share the same `parentElement` — abort with toast if not
2. Record a reference to `currentEquivalentNodes[0].nextSibling` (the insertion anchor)
3. Iterate `currentEquivalentNodes`, call `getBoundingClientRect()` on each
4. Compute `min(top)`, `min(left)`, `max(bottom)`, `max(right)`
5. Add `window.scrollX` / `window.scrollY` to account for scroll position
6. Pass the resulting region to `html2canvas(document.body, { x, y, width, height })`
7. Remove all `currentEquivalentNodes` from the DOM
8. Insert the canvas wrapper using `parent.insertBefore(wrapper, anchor)` (or `parent.appendChild` if anchor is `null`)

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `overlay/src/screenshot.ts` | `captureRegion()` utility — html2canvas wrapper with cleanup logic |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add `html2canvas` dependency |
| `shared/types.ts` | Add `CaptureScreenshotMessage` type (no `insertMode`); add `'replace'` to `InsertMode`; add `screenshot?: string` to `ElementContextMessage` |
| `overlay/src/index.ts` | Add `CAPTURE_SCREENSHOT` handler: validate siblings, run capture, remove selected nodes, insert wrapper at first node's position, send `ELEMENT_CONTEXT` with `insertMode: 'replace'` and `screenshot` |
| `panel/src/components/DrawTab/DrawTab.tsx` | Add "Screenshot & Annotate" section with single capture button |
| `panel/src/components/DesignCanvas/types.ts` | Add `backgroundImage?: string` to `DesignCanvasProps` |
| `panel/src/components/DesignCanvas/useFabricCanvas.ts` | Import `FabricImage`; load background image; restore on clear |
| `panel/src/DesignMode.tsx` | Extract `screenshot` from `ELEMENT_CONTEXT`; pass as `backgroundImage` to `DesignCanvas` |

---

## Edge Cases & Constraints

### Sibling Requirement

The selected elements (`currentEquivalentNodes`) **must all share the same `parentElement`** — i.e., be direct siblings in the DOM — for the replace flow to work correctly. If they are not siblings:

- The overlay shows a toast: `"Screenshot & Annotate requires all selected elements to be siblings in the DOM."`
- The flow aborts; no screenshot is taken and no elements are removed

This constraint exists because the canvas wrapper is inserted at the position of the first sibling and replaces all of them as a group. Non-sibling nodes would leave holes in multiple places in the DOM with no clean single insertion point.

### Restoring Elements on Close

When the user closes the drawing canvas (DESIGN_CLOSE), the canvas wrapper is removed. The original elements that were replaced are **not** automatically restored — the DOM change is intentional (the user chose to replace them with a canvas). An AI agent receiving the `'replace'` `insertMode` in the patch is expected to handle the replacement semantically.

If restoration is needed in the future, the removed nodes can be stored in a `Map` keyed by the wrapper element and re-inserted on close.

### Payload Size

A screenshot of a large element (e.g., a full-width hero section at 1440px wide) could produce a 500KB+ base64 PNG. This is transmitted via WebSocket as part of the `ELEMENT_CONTEXT` message.

- **For local development** (primary use case): This is fine. Local WebSocket has no meaningful size limit.
- **Future optimization**: If needed, add JPEG compression with quality parameter, or downscale to max dimensions (e.g., 1200px wide). Defer until proven necessary.

### Cross-Origin Images

`<img>` elements with cross-origin `src` URLs may render as blank in the screenshot unless the server provides CORS headers. The `useCORS: true` option tells html2canvas to attempt fetching images with CORS. This works for:
- Images served from the same dev server
- CDN images with permissive CORS headers
- Does **not** work for images from servers that block CORS

Fallback: cross-origin images appear as blank rectangles in the screenshot. This is acceptable — the surrounding layout context is still captured.

### Shadow DOM Content

html2canvas cannot render content inside Shadow DOM boundaries. This affects:
- ✅ **Overlay UI** — lives in shadow DOM, so it's *correctly excluded* from screenshots
- ⚠️ **User components using shadow DOM** — their internal content won't render in the screenshot. This is a known html2canvas limitation. For the typical React app (no shadow DOM), this is not an issue.

### Scroll Position

Elements may be partially scrolled out of view. The capture uses `getBoundingClientRect()` (viewport-relative) plus `window.scrollX/Y` (scroll offset) to compute the correct absolute page coordinates for html2canvas. Elements that are partially off-screen will be captured at their full dimensions including the off-screen portion.

### Timing: Highlights During Capture

The overlay's highlight overlays (teal/orange pulsing borders) are positioned absolutely on `document.body`. They must be hidden before capture:

1. Query all `.highlight-overlay` elements
2. Set `display: none` on each
3. Run html2canvas
4. Restore original display values

The `ignoreElements` callback handles `[data-tw-design-canvas]` wrappers. Highlight overlays need explicit hiding because they're simple `div` elements without a distinguishing attribute that `ignoreElements` could target — or alternatively, add a `data-tw-highlight` attribute to highlight divs for cleaner filtering.

---

## Verification

| # | Test | Type | Expected Result |
|---|------|------|-----------------|
| 1 | Select single element → Screenshot & Annotate | Manual | Canvas replaces element with screenshot as background; draw on top; submit produces composite PNG |
| 2 | Select component with 3+ sibling instances → Screenshot & Annotate | Manual | All instances are removed; screenshot of union bounding box shown as canvas background |
| 3 | Select elements that are NOT siblings → Screenshot & Annotate | Manual | Toast error shown; no elements removed; no canvas inserted |
| 4 | Use existing "Insert Drawing Canvas" buttons | Manual | Canvas opens with white background (no regression); existing elements untouched |
| 5 | Clear canvas with screenshot background | Manual | Annotations cleared, but screenshot background remains |
| 6 | Submit annotated screenshot | Manual | Server receives design patch with composite image (background + annotations) and `insertMode: 'replace'` |
| 7 | Provide `backgroundImage` prop to DesignCanvas | Unit test | Canvas initializes with image as locked background at correct dimensions |
| 8 | DesignCanvas without `backgroundImage` prop | Unit test | Canvas initializes with white background (backward compatible) |
| 9 | DesignCanvas Storybook story with background image | Storybook | Story renders canvas with a sample image as background |
| 10 | `areSiblings()` with nodes sharing same parent | Unit test | Returns `true` |
| 11 | `areSiblings()` with nodes from different parents | Unit test | Returns `false` |
