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
      │  └── sees NEW "Screenshot & Annotate" section
      ▼
4. User clicks "Screenshot & Annotate" with an insertion mode (e.g. "After element")
      │  └── panel sends CAPTURE_SCREENSHOT { insertMode } → overlay
      ▼
5. Overlay hides highlight overlays temporarily
      │  └── computes union bounding box of currentEquivalentNodes
      │  └── calls html2canvas to capture the region as PNG
      │  └── restores highlight overlays
      ▼
6. Overlay injects Canvas Wrapper (same as existing draw flow)
      │  └── creates wrapper + iframe pointing to /panel/?mode=design
      │  └── on iframe load, sends ELEMENT_CONTEXT with screenshot field
      ▼
7. Design iframe receives ELEMENT_CONTEXT (with screenshot)
      │  └── passes screenshot as backgroundImage prop to DesignCanvas
      ▼
8. Canvas renders with screenshot as locked background
      │  └── canvas dimensions match the screenshot
      │  └── user draws annotations on top
      ▼
9. User clicks "Queue as Change"
      │  └── Fabric.js toDataURL() captures composite (background + annotations)
      │  └── design iframe sends DESIGN_SUBMIT → server (same as existing flow)
      ▼
10. Server queues the annotated screenshot as a design patch
```

---

## Architecture

### Capture Strategy: html2canvas in the Overlay

The screenshot is captured in the overlay layer, not the panel, because the overlay has direct DOM access to the user's page. The capture flow:

1. **Temporarily hide overlay UI** — highlight overlays, toolbars, and design canvas wrappers are hidden to get a clean screenshot of the page content only
2. **Compute capture region** — union bounding box of all `currentEquivalentNodes`
3. **Call html2canvas** — renders the page region to a `<canvas>` element, then exports as PNG data URL
4. **Restore overlay UI** — highlights and toolbars reappear
5. **Pass screenshot via WebSocket** — included in the `ELEMENT_CONTEXT` message as a new `screenshot` field

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

Sent from panel → overlay when user clicks a "Screenshot & Annotate" button:

```ts
interface CaptureScreenshotMessage {
  type: 'CAPTURE_SCREENSHOT';
  insertMode: InsertMode;  // 'before' | 'after' | 'first-child' | 'last-child'
}
```

### Extended Message: `ELEMENT_CONTEXT`

The existing `ElementContextMessage` gains an optional `screenshot` field:

```ts
interface ElementContextMessage {
  type: 'ELEMENT_CONTEXT';
  componentName: string;
  instanceCount: number;
  target: { tag: string; classes: string; innerText: string };
  context: string;
  insertMode: InsertMode;
  screenshot?: string;      // NEW — base64 PNG data URL of the captured region
}
```

When `screenshot` is present, the design canvas renders it as a locked background image. When absent (standard draw flow), the canvas uses a white background as before.

### Message Flow Diagram

```
  Panel                    Overlay                   Design iframe           Server
    │                        │                           │                     │
    │  CAPTURE_SCREENSHOT    │                           │                     │
    │  { insertMode }        │                           │                     │
    │───────────────────────>│                           │                     │
    │                        │── hide highlights         │                     │
    │                        │── html2canvas(region)     │                     │
    │                        │── restore highlights      │                     │
    │                        │── inject wrapper+iframe ──│                     │
    │                        │                           │                     │
    │                        │   ELEMENT_CONTEXT         │                     │
    │                        │   { ..., screenshot }     │                     │
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
│  Capture the selected element and annotate  │
│  the screenshot in the drawing canvas.      │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ 📷 Before    │  │ 📷 After     │        │  ← new buttons
│  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ 📷 First     │  │ 📷 Last      │        │
│  └──────────────┘  └──────────────┘        │
│                                             │
│  The canvas will be injected relative to... │
└─────────────────────────────────────────────┘
```

The new buttons send `CAPTURE_SCREENSHOT` instead of `INSERT_DESIGN_CANVAS`:

```ts
sendTo('overlay', {
  type: 'CAPTURE_SCREENSHOT',
  insertMode,
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

When the user has selected a component with multiple instances (e.g., 3 cards in a row), the screenshot captures the **union bounding box** — the smallest rectangle that contains all selected instances.

```
┌─────────────────────────────── page ──────────────────────────────┐
│                                                                    │
│  ┌── Card 1 ──┐  ┌── Card 2 ──┐  ┌── Card 3 ──┐                 │
│  │  ■ Title   │  │  ■ Title   │  │  ■ Title   │                 │
│  │  body text │  │  body text │  │  body text │                 │
│  └────────────┘  └────────────┘  └────────────┘                 │
│                                                                    │
│  ◄──────────── union bounding box ────────────►                   │
│  (captured as screenshot)                                          │
└────────────────────────────────────────────────────────────────────┘
```

### Algorithm

1. Iterate `currentEquivalentNodes` (all selected instances)
2. Call `getBoundingClientRect()` on each
3. Compute `min(top)`, `min(left)`, `max(bottom)`, `max(right)`
4. Add `window.scrollX` / `window.scrollY` to account for scroll position
5. Pass the resulting region to `html2canvas(document.body, { x, y, width, height })`

This captures all selected instances plus any page content between them (e.g., gaps, separators), giving full visual context.

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
| `shared/types.ts` | Add `CaptureScreenshotMessage` type; add `screenshot?: string` to `ElementContextMessage` |
| `overlay/src/index.ts` | Add `CAPTURE_SCREENSHOT` message handler; include `screenshot` in `ELEMENT_CONTEXT` |
| `panel/src/components/DrawTab/DrawTab.tsx` | Add "Screenshot & Annotate" section with capture buttons |
| `panel/src/components/DesignCanvas/types.ts` | Add `backgroundImage?: string` to `DesignCanvasProps` |
| `panel/src/components/DesignCanvas/useFabricCanvas.ts` | Import `FabricImage`; load background image; restore on clear |
| `panel/src/DesignMode.tsx` | Extract `screenshot` from `ELEMENT_CONTEXT`; pass as `backgroundImage` to `DesignCanvas` |

---

## Edge Cases & Constraints

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
| 1 | Select single element → Screenshot & Annotate (After) | Manual | Canvas opens with element screenshot as background; draw on top; submit produces composite PNG |
| 2 | Select component with 3+ instances → Screenshot & Annotate | Manual | Screenshot captures union bounding box of all instances |
| 3 | Use existing "Insert Drawing Canvas" buttons | Manual | Canvas opens with white background (no regression) |
| 4 | Clear canvas with screenshot background | Manual | Annotations cleared, but screenshot background remains |
| 5 | Submit annotated screenshot | Manual | Server receives design patch with composite image (background + annotations) |
| 6 | Provide `backgroundImage` prop to DesignCanvas | Unit test | Canvas initializes with image as locked background at correct dimensions |
| 7 | DesignCanvas without `backgroundImage` prop | Unit test | Canvas initializes with white background (backward compatible) |
| 8 | DesignCanvas Storybook story with background image | Storybook | Story renders canvas with a sample image as background |
