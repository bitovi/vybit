# Decomposed Moveable Objects Canvas — Spec

## Overview

Replace the current "Screenshot & Annotate" flow with a **decomposed-elements canvas**: when the user triggers capture mode, walk the selected element's subtree, identify visually meaningful child elements, rasterize each to a PNG, and place them as individual Fabric.js image objects on the existing design canvas. The user can drag/resize/reorder these element images — and still use freehand drawing tools for annotations. On submit, the agent receives both a composite PNG screenshot and per-element metadata (original selector, new position/size).

## Motivation

The current Screenshot & Annotate flow captures the selected element as a single flat PNG. The user can draw on top of it, but can't rearrange individual sub-elements. If someone wants to move a button from the right side to the left, or stack a title above an image instead of beside it, they have to draw arrows or annotate "move this here" — the agent has to interpret spatial intent from a freehand sketch.

By decomposing the element into its visible children and placing each as a separate draggable object, we let users **directly show** the arrangement they want. The agent receives precise before/after position data for each element alongside the visual screenshot.

## Vocabulary

| Term | Definition |
|------|-----------|
| **Decomposed Element** | A visually meaningful child of the selected element, captured as an individual PNG image and placed as a Fabric.js object on the design canvas. |
| **Visibility Heuristic** | The set of rules that determine whether a DOM element is "visually meaningful" (has something to see) vs purely structural (layout-only container). |
| **Element Metadata** | Per-object data attached to each Fabric image: the element's CSS selector, original bounding rect, and (on submit) new bounding rect. |
| **Composite Screenshot** | A full PNG capture of the entire selected region, used as a dimmed background layer on the canvas for spatial context. |

---

## User Flow

```
1. User clicks element in the page
      │
      ▼
2. Overlay shows element toolbar with draw button (pencil icon)
      │
      ▼
3. User clicks draw button → popover shows "Screenshot & Annotate"
      │
      ▼
4. Overlay decomposes the selected element's subtree
   │  └── walks DOM depth-first
   │  └── identifies visually meaningful elements via visibility heuristic
   │  └── rasterizes each visible element to individual PNG
   │  └── captures composite screenshot of entire region
   │
      ▼
5. Overlay removes original nodes from DOM (same as current flow)
   │  └── saves nodes for restoration on close
      │
      ▼
6. Overlay injects design canvas wrapper + iframe (same as current flow)
   │  └── sends ELEMENT_CONTEXT with decomposedElements array to design iframe
      │
      ▼
7. Design canvas receives decomposed elements
   │  └── renders composite screenshot as locked/dimmed background layer
   │  └── places each element PNG as a separate draggable Fabric.js Image
   │  └── positions each at its original coordinates (normalized to canvas)
   │  └── z-order matches original DOM stacking (DFS walk order)
      │
      ▼
8. User rearranges elements — drag, resize, reorder
   │  └── can also use freehand drawing, shapes, text, arrows for annotation
      │
      ▼
9. User clicks "Submit Design"
   │  └── canvas exports composite PNG (same as current)
   │  └── extracts per-element metadata: { selector, originalRect, newRect }
   │  └── sends DESIGN_SUBMIT with image + decomposedElements
      │
      ▼
10. Server queues design patch with element position data
       │
       ▼
11. AI agent calls implement_next_change
    │  └── receives PNG screenshot + element position table
    │  └── each row shows: CSS selector, original position/size, new position/size
    │  └── agent modifies CSS/Tailwind to achieve the rearranged layout
```

---

## Architecture

### Visibility Detection

A new module `overlay/src/visibility.ts` provides two functions:

#### `isVisuallyMeaningful(el: HTMLElement): boolean`

Determines whether a DOM element has visual presence — something a user can see — vs being a purely structural container (flex wrapper, grid container with no background, etc.).

Checks computed styles against a **baseline element** of the same tag (reuses the pattern from `adaptive-iframe/style-cloner.ts` `extractStyles()`). Returns `true` if any of the following are detected:

| Signal | Detection |
|--------|-----------|
| Background color | `background-color` is not `transparent`, `rgba(0,0,0,0)`, or the baseline default |
| Background image | `background-image` is not `none` |
| Border | Any `border-*-width` > `0px` with non-transparent `border-*-color` |
| Box shadow | `box-shadow` is not `none` |
| Opacity effect | `opacity` < 1 |
| Transform effect | `transform` is not `none` |
| Text content | Element has direct text node children with non-whitespace `.textContent` |
| Media element | Tag is `img`, `svg`, `video`, `canvas`, `picture`, or `iframe` |
| Pseudo-element | `getComputedStyle(el, '::before').content` is not `none` or `normal` (same for `::after`) |

#### `decomposeSubtree(root: HTMLElement): DecomposedElement[]`

Leaf-first DFS walk of the subtree. For each element:

1. If it's a **leaf** (no element children) and `isVisuallyMeaningful()` → include it
2. If it's a **parent** and `isVisuallyMeaningful()` with its own visual properties (e.g., background, border — not counting properties inherited from children) → include it as a separate object representing just the element's own "box"
3. Skip elements inside the overlay shadow DOM host

For each included element, captures:
```ts
interface DecomposedElement {
  el: HTMLElement;
  rect: DOMRect;          // from getBoundingClientRect()
  selector: string;       // stable CSS path: tag + classes + nth-child
}
```

The `selector` provides a stable reference the agent can use to identify which DOM element to modify. Built from `tagName`, class list (CSS-escaped for Tailwind's special chars), and `:nth-child()` for disambiguation.

**Z-order:** Elements are returned in DFS walk order. When a parent element is included (for its own background), it appears before its children in the array — matching the expected visual stacking on the canvas (parent background behind, children on top).

### Element Rasterization

Extension to `overlay/src/screenshot.ts`:

#### `rasterizeElements(elements: DecomposedElement[]): Promise<RasterizedElement[]>`

For each decomposed element:
- Uses existing `toPng()` from `html-to-image` (already a project dependency)
- Captures at `pixelRatio: 1` using the element's `getBoundingClientRect()` dimensions
- Runs **sequentially** — parallel `toPng()` calls can interfere with each other (shared `foreignObject` rendering)

Returns:
```ts
interface RasterizedElement {
  dataUrl: string;    // base64 PNG
  width: number;
  height: number;
  selector: string;
  originalRect: { x: number; y: number; width: number; height: number };
}
```

### Message Protocol

#### Overlay → Design Iframe: `ELEMENT_CONTEXT` (extended)

Existing fields remain. New field added:

```ts
interface ElementContextMessage {
  // ... existing fields (componentName, instanceCount, target, context, insertMode)
  screenshot?: string;              // composite screenshot (kept for background layer)
  decomposedElements?: Array<{
    dataUrl: string;                // base64 PNG of individual element
    width: number;
    height: number;
    selector: string;               // CSS selector path for agent reference
    originalRect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}
```

When `decomposedElements` is present, the design canvas uses it for individual element placement. When absent (legacy path or if decomposition fails), falls back to the single `screenshot` background image.

#### Design Iframe → Server: `DESIGN_SUBMIT` (extended)

```ts
interface DesignSubmitMessage {
  // ... existing fields (image, componentName, target, context, insertMode, canvasWidth, canvasHeight, canvasComponents)
  decomposedElements?: Array<{
    selector: string;
    originalRect: { x: number; y: number; width: number; height: number };
    newRect: { x: number; y: number; width: number; height: number };
  }>;
}
```

### Fabric Canvas Integration

When `decomposedElements` is received in `useFabricCanvas.ts`:

1. **Background layer:** Render the composite `screenshot` as a locked, non-selectable, dimmed (e.g., 30% opacity) background image. This provides spatial context — the user can see where elements originally sat relative to each other.

2. **Element images:** For each decomposed element:
   - `FabricImage.fromURL(dataUrl)` creates the image object
   - Position at `(originalRect.x - canvasOffsetX, originalRect.y - canvasOffsetY)` — normalized so the top-left of the selected region maps to canvas origin
   - Attach `_elementMeta: { selector, originalRect }` to the Fabric object (mirrors the existing `_componentMeta` pattern used for dropped components)
   - Element images are selectable, draggable, and resizable by default (Fabric.js provides this)
   - Z-order follows the array order (DFS walk order from `decomposeSubtree`)

3. **Drawing tools:** Existing freehand, shape, text, and arrow tools remain available. The user can annotate alongside the moveable element images.

### Submission Flow

The existing `handleSubmit` in `useFabricCanvas.ts` is extended:

1. Loop all Fabric objects
2. For those with `_elementMeta`, extract:
   ```ts
   {
     selector: meta.selector,
     originalRect: meta.originalRect,
     newRect: {
       x: Math.round((obj.left ?? 0) - offsetX),
       y: Math.round((obj.top ?? 0) - offsetY),
       width: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
       height: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
     }
   }
   ```
3. Include as `decomposedElements` in the `DESIGN_SUBMIT` message
4. The composite PNG (from `canvas.toDataURL()`) is sent as `image` (same as current)

### MCP Agent Output

In `server/mcp-tools.ts`, when a design patch has `decomposedElements`, the agent instructions include an element-position table:

```markdown
**Element rearrangements (original → new position):**

| # | Selector | Original (x, y, w×h) | New (x, y, w×h) | Delta |
|---|----------|-----------------------|------------------|-------|
| 1 | `div.card-image > img` | (0, 0, 300×200) | (0, 220, 300×200) | ↓220px |
| 2 | `h2.card-title` | (0, 210, 300×28) | (0, 0, 300×28) | ↑210px |
| 3 | `p.card-body` | (0, 248, 300×48) | (0, 38, 300×48) | ↑210px |
| 4 | `button.card-cta` | (200, 310, 100×36) | (0, 96, 150×36) | ←200px ↑214px, wider |
```

This gives the agent both the visual screenshot (for holistic understanding) and precise per-element movement data (for targeted CSS changes).

---

## Implementation Phases

### Phase 1: Visibility Detection

**New file:** `overlay/src/visibility.ts`

- `isVisuallyMeaningful(el)` — baseline comparison against same-tag element for each visual property
- `decomposeSubtree(root)` — DFS walk returning `DecomposedElement[]`
- Unit tests for both functions

### Phase 2: Rasterization & Message Flow

**Modified:** `overlay/src/screenshot.ts`, `overlay/src/index.ts`, `shared/types.ts`

- Add `rasterizeElements()` to screenshot module
- Modify `handleCaptureScreenshot()` to call decompose → rasterize → send via `ELEMENT_CONTEXT`
- Extend `ElementContextMessage` type with `decomposedElements` field
- Composite screenshot captured alongside individual elements (for background layer)

### Phase 3: Canvas Integration

**Modified:** `panel/src/DesignMode.tsx`, `panel/src/components/DesignCanvas/useFabricCanvas.ts`, `panel/src/components/DesignCanvas/DesignCanvas.tsx`

- Pass `decomposedElements` from `DesignMode` through to canvas hook
- Place element images on Fabric canvas with `_elementMeta` attached
- Render composite screenshot as dimmed background layer
- Drawing tools remain unchanged

### Phase 4: Submission & Agent Output

**Modified:** `shared/types.ts`, `panel/src/components/DesignCanvas/useFabricCanvas.ts`, `server/websocket.ts`, `server/mcp-tools.ts`

- Extend `DesignSubmitMessage` and `Patch` with `decomposedElements`
- Extract element positions on submit
- Forward through server to MCP tools
- Render element-position table in agent instructions

---

## Affected Files

| File | Change |
|------|--------|
| `overlay/src/visibility.ts` | **New** — `isVisuallyMeaningful()`, `decomposeSubtree()` |
| `overlay/src/screenshot.ts` | Add `rasterizeElements()` |
| `overlay/src/index.ts` | Modify `handleCaptureScreenshot()` to decompose + rasterize |
| `shared/types.ts` | Extend `ElementContextMessage`, `DesignSubmitMessage`, `Patch` |
| `panel/src/DesignMode.tsx` | Pass `decomposedElements` to canvas |
| `panel/src/components/DesignCanvas/DesignCanvas.tsx` | Accept `decomposedElements` prop |
| `panel/src/components/DesignCanvas/useFabricCanvas.ts` | Place element images, extract positions on submit |
| `server/websocket.ts` | Forward `decomposedElements` into Patch |
| `server/mcp-tools.ts` | Render element position table in agent instructions |

**Reference (no changes):**
| File | Why |
|------|-----|
| `overlay/src/adaptive-iframe/style-cloner.ts` | Pattern reference for `extractStyles()` baseline comparison |

---

## Verification

### Unit Tests

1. **`isVisuallyMeaningful()`** — Test cases:
   - `div` with `background-color: blue` → `true`
   - `div` with `border: 1px solid black` → `true`
   - `div` with text content "Hello" → `true`
   - `div` with no styles, no text (plain flex container) → `false`
   - `img` tag → `true`
   - `svg` tag → `true`
   - `div` with `box-shadow` → `true`
   - `div` with `opacity: 0.5` → `true`
   - `div` with `transform: rotate(45deg)` → `true`

2. **`decomposeSubtree()`** — Test cases:
   - Nested structure: `div.flex > [div.card-bg, div.flex-inner > [h2, p, button]]` → returns `div.card-bg`, `h2`, `p`, `button` (skips `div.flex` and `div.flex-inner` since they're structural)
   - Parent with own background: `div.panel[bg-white] > [h2, p]` → returns `div.panel` (for its background), `h2`, `p`
   - Z-order: parent background appears before children in the returned array

### Manual Tests

3. **Decompose flow:** Select a complex component (card with image, title, description, button) → trigger Screenshot & Annotate → verify each visible sub-element appears as a separate draggable Fabric object
4. **Rearrange + submit:** Move elements around on the canvas → submit → verify MCP output includes both composite PNG and per-element position table with correct selector / position data
5. **Drawing tools:** Verify freehand drawing, shapes, and text still work alongside the placed element images
6. **Canvas close:** Close the design canvas → verify original DOM nodes are restored to their original positions
7. **Fallback:** If decomposition fails or returns empty, verify it falls back to the current single-screenshot behavior

### E2E Tests

8. Extend existing Playwright tests to cover: decompose → rearrange → submit → verify agent output

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Fabric.js canvas (panel iframe)** over in-page DOM manipulation | Reuses existing design canvas infrastructure (drag/resize/select/z-order already work). Aligns with the existing design submission paradigm. |
| **Replaces Screenshot & Annotate** rather than adding a third option | The decomposed approach is a strict upgrade — you still get the composite screenshot as a background layer, plus individual element manipulation. No reason to keep both. |
| **Broad visibility heuristic** (includes opacity/transform) | These CSS properties produce visible effects. A `div` with `opacity: 0.8` or `transform: rotate(5deg)` is visually distinct and should be manipulable. |
| **Drawing tools remain available** | Canvas is dual-purpose: rearrange elements to show layout intent + annotate with freehand/shapes to call out specific changes (arrows, labels, etc.). |
| **Screenshot + element positions** for agent output | Visual screenshot gives holistic intent; structured position data gives precise per-element changes. Agent can use either or both. |

---

## Edge Cases & Considerations

### Overlapping Elements

When a parent element has a background AND its children are also visually meaningful:
- The parent's background becomes one Fabric object
- Children become separate Fabric objects on top
- Z-order on the canvas matches DFS walk order (parent before children), so the background renders behind the children — matching the original visual stacking

### Pseudo-Element Rendering

`::before` and `::after` pseudo-elements with `content` set are visually present but are not real DOM nodes. `toPng()` captures them as part of the element they belong to (since `html-to-image` renders the element's full visual including pseudos). The visibility heuristic detects them as a signal that the element is meaningful, but they don't become separate objects. This is the correct behavior — a pseudo-element is part of its parent's visual.

### Fallback Path

If `decomposeSubtree()` returns an empty array (unlikely but possible — e.g., an element with only `display:none` children), fall back to the current single-screenshot behavior: send `screenshot` without `decomposedElements`, and the design canvas renders it as a background image like today.

### Canvas Size

The canvas wrapper dimensions are set from the composite screenshot dimensions (same as current "replace" mode). Individual element images are positioned relative to the canvas origin using their original `getBoundingClientRect()` coordinates offset by the selected region's top-left corner.
