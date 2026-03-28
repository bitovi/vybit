# 034 — Text Editing

Inline text editing via `contentEditable`. The user clicks an "Edit Text" button in the Element Toolbar, the element becomes directly editable, and on confirm the overlay captures the `innerHTML` diff as a new `text-change` patch kind that the AI agent applies to source code.

---

## Goals

1. Let users edit text content of any selected element without leaving the visual inspector
2. Support full rich text — bold, italic, line breaks, nested elements — via the browser's native `contentEditable`
3. Produce a new `text-change` patch kind that flows through the existing commit/queue/MCP pipeline
4. Give the AI agent clear old/new HTML with surrounding context so it can translate browser HTML into JSX/TSX source changes

## Non-Goals

- **Clone-based editing** — editing happens directly on the real DOM element in v1 (clone approach is a follow-up; see § Follow-Up)
- **Double-click-to-edit** — trigger is an explicit toolbar button
- **Custom rich text toolbar** — users rely on native keyboard shortcuts (Cmd+B, Cmd+I, Enter, etc.)
- **Structured HTML diffing** — the agent receives raw old/new `innerHTML` strings, not a diff
- **Multi-instance editing** — only the clicked element is editable; other equivalent instances are unaffected
- **Undo/redo UI** — the browser's built-in contentEditable undo (Cmd+Z) is sufficient

---

## Data Flow

```
User clicks "Edit Text" button in Element Toolbar
  ↓
Overlay sets contentEditable on real element, stores originalHtml
  ↓  sends TEXT_EDIT_ACTIVE → Panel (dims class editing UI)
  ↓
User types, applies bold/italic, adds line breaks
  ↓
User presses Cmd+Enter (confirm) or Escape (cancel)
  ↓
                ┌──────────────────────┬────────────────────────┐
                │  Confirm             │  Cancel                │
                ├──────────────────────┼────────────────────────┤
                │  newHtml = innerHTML  │  innerHTML = original  │
                │  Build Patch          │  No patch              │
                │  Send PATCH_STAGED    │                        │
                │  → Server queue       │                        │
                └──────────────────────┴────────────────────────┘
  ↓
Remove contentEditable, outline, listeners
  ↓  sends TEXT_EDIT_DONE → Panel
  ↓
Patch appears in draft → user commits → agent receives via implement_next_change
```

---

## New Patch Kind: `text-change`

### Type Changes (`shared/types.ts`)

```ts
export type PatchKind = 'class-change' | 'message' | 'design' | 'component-drop' | 'text-change';
```

New optional fields on `Patch` and `PatchSummary`:

```ts
// Text-change fields (used when kind === 'text-change'):
originalHtml?: string;   // innerHTML before editing
newHtml?: string;         // innerHTML after editing
```

### New WebSocket Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `TEXT_EDIT_ACTIVE` | Overlay → Panel | Text editing in progress — panel should disable class editing UI |
| `TEXT_EDIT_DONE` | Overlay → Panel | Text editing session ended |

No new server-bound message type. Text-change patches reuse the existing `PATCH_STAGED` message since it already sends a full `Patch` object — the server's `addPatch` handles arbitrary kinds.

```ts
export interface TextEditActiveMessage {
  type: 'TEXT_EDIT_ACTIVE';
  to: 'panel';
}

export interface TextEditDoneMessage {
  type: 'TEXT_EDIT_DONE';
  to: 'panel';
}
```

---

## Overlay: Edit Text Button

A new "Edit Text" button is added to the Element Toolbar, between the Draw button and the separator.

### Button Spec

| Property | Value |
|----------|-------|
| CSS class | `el-text-btn` |
| Icon | Text-cursor SVG ("T" with cursor) |
| Title | `"Edit text"` |
| Position | After Draw button, before separator |
| Click handler | Calls `startTextEdit(currentTargetEl)` |

### Toolbar Layout (After)

```
[ Re-select ] [ Draw ] [ Edit Text ] │ [ N + ]
```

### Styles

Same base styles as existing toolbar buttons (`.el-text-btn` inherits from the shared button ruleset). Same hover treatment (`background: rgba(255,255,255,0.12)`).

---

## Overlay: Text Edit Module (`overlay/src/text-edit.ts`)

New module with two exported functions.

### `startTextEdit(targetEl, deps)`

**Parameters:**
- `targetEl: HTMLElement` — the selected DOM element
- `deps` — injected dependencies from `index.ts`: `sendTo`, `currentBoundary`, `currentTargetEl`, `buildContext` reference, `SERVER_ORIGIN`, toolbar repositioning function

**Behavior:**

1. Store `originalHtml = targetEl.innerHTML`
2. Set `targetEl.contentEditable = 'true'`
3. Add visual indicator: `targetEl.style.outline = '2px dashed #00848B'` (bv-teal)
4. Focus the element; select all text content via `window.getSelection()` + `Range`
5. Set overlay-level `isTextEditing = true` flag
6. Register event listeners on `targetEl`:
   - **`keydown`**: Escape → `endTextEdit(false)`, Cmd/Ctrl+Enter → `endTextEdit(true)`
   - **`blur`**: `endTextEdit(true)` after a 200ms delay (avoids false trigger when clicking toolbar)
7. Register **scroll** and **resize** listeners on `window` to reposition the toolbar via the existing `positionWithFlip()` utility
8. Send `TEXT_EDIT_ACTIVE` to panel

### `endTextEdit(confirm)`

**Parameter:** `confirm: boolean`

**Behavior:**

1. If `confirm` and `targetEl.innerHTML !== originalHtml`:
   - Build `Patch` with:
     - `kind: 'text-change'`
     - `originalHtml`
     - `newHtml: targetEl.innerHTML`
     - `elementKey`: component name (from `currentBoundary`)
     - `target: { tag, classes, innerText }` — from the element
     - `component: { name, instanceCount }` — from selection state
     - `context` — from `buildTextContext(targetEl)` (see § Context Building)
     - `pageUrl: window.location.href`
   - Send `PATCH_STAGED` with the patch to the server
2. If cancel (`!confirm`):
   - Restore `targetEl.innerHTML = originalHtml`
3. Remove `contentEditable` attribute: `targetEl.removeAttribute('contentEditable')`
4. Remove inline outline: `targetEl.style.outline = ''`
5. Remove scroll/resize listeners
6. Remove keydown/blur listeners
7. Set `isTextEditing = false`
8. Send `TEXT_EDIT_DONE` to panel

### State Gating

While `isTextEditing === true`, the overlay ignores:
- `PATCH_PREVIEW` messages
- `PATCH_PREVIEW_BATCH` messages
- `PATCH_STAGE` messages
- `PATCH_REVERT` messages

This prevents the panel's class editing from interfering with an in-progress text edit.

---

## Context Building (`overlay/src/context.ts`)

Add a new function `buildTextContext`:

```ts
export function buildTextContext(
  target: HTMLElement,
  originalClassMap: Map<HTMLElement, string>,
): string
```

Same structural walk as `buildContext` but the target annotation reads:

```html
<h2 class="text-xl font-bold"> <!-- TARGET: text changed -->
  Original text here
</h2>
```

The existing `buildContext` signature takes `oldClass`/`newClass` for the annotation. `buildTextContext` reuses the same ancestor-walking logic but substitutes the annotation string.

---

## Server: Queue Handling (`server/queue.ts`)

### Dedup Logic

Current behavior: `addPatch` deduplicates `class-change` patches by `elementKey + property`. For `text-change`:

- Dedup by `elementKey` only — if a text-change patch already exists in the draft for the same element, replace it
- This ensures multiple edits on the same element before committing only keep the latest

```ts
if (patch.kind === 'text-change') {
  const existingIdx = draftPatches.findIndex(
    p => p.kind === 'text-change' && p.elementKey === patch.elementKey && p.status === 'staged'
  );
  if (existingIdx !== -1) {
    draftPatches.splice(existingIdx, 1);
  }
}
```

### Field Retention

Unlike `ghostHtml` (stripped from component-drop patches in MCP responses), `originalHtml` and `newHtml` must be **kept** in the MCP response — the agent needs them to know what changed.

---

## MCP: Agent Instructions (`server/mcp-tools.ts`)

### `buildCommitInstructions` Addition

Add a `textChanges` filter alongside existing `classChanges`, `messages`, `designs`, `componentDrops`:

```ts
const textChanges = commit.patches.filter(p => p.kind === 'text-change');
```

For each text-change patch, emit:

```markdown
### N. Text change `<patch-id>`
- **Component:** `ComponentName`
- **Element:** `<tag>`
- **Original HTML:**
```html
<p>Hello world</p>
```
- **New HTML:**
```html
<p>Hello <strong>world</strong></p>
```
- **Context HTML:**
```html
<section class="hero">
  <h2 class="text-xl"> <!-- TARGET: text changed -->
    Hello world
  </h2>
</section>
```

Translate the HTML changes into the corresponding JSX/TSX source code changes.
The new HTML may include formatting elements like `<strong>`, `<em>`, `<br>`,
`<div>`, etc. added via contentEditable — map these to JSX equivalents.
```

Update `summaryParts` to include text changes:
```ts
if (textChanges.length) summaryParts.push(`${textChanges.length} text change${textChanges.length === 1 ? '' : 's'}`);
```

Add text-change patch IDs to the `mark_change_implemented` results template and step instructions.

---

## Panel: UI Feedback

### Text Editing State

When `TEXT_EDIT_ACTIVE` is received:
- Show a status indicator (e.g. "Editing text..." banner or badge)
- Disable/dim the class editing controls (scrubbers, color grid, etc.)

When `TEXT_EDIT_DONE` is received:
- Restore normal panel state

### Queue Drawer

Text-change patches in the draft/commit list display differently from class-change patches:

| Kind | Display |
|------|---------|
| `class-change` | `px-4 → px-6` (class name swap) |
| `text-change` | `Text edited` with a truncated preview of the new HTML |
| `message` | User message text |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Escape** | Cancel text editing — revert innerHTML to original |
| **Cmd+Enter** (macOS) / **Ctrl+Enter** (other) | Confirm text editing — stage patch |
| **Cmd+B** | Bold (native contentEditable) |
| **Cmd+I** | Italic (native contentEditable) |
| **Enter** | New line / `<div>` or `<br>` (native contentEditable) |
| **Cmd+Z** | Undo (native contentEditable) |

---

## Scroll & Resize

While text editing is active:
- **Scroll listener** on `window`: reposition the Element Toolbar via `positionWithFlip()` so it tracks the editing element
- **Resize listener** on `window`: same repositioning

Listeners are added in `startTextEdit` and removed in `endTextEdit`.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Element has no text (image, empty div) | Still becomes contentEditable — user can type into it. Escape to cancel. |
| Element contains child elements (buttons, links) | Children become text-editable within the parent — this is expected and desired. |
| React re-renders during edit | innerHTML may be wiped. Known v1 limitation. The clone-based approach (see § Follow-Up) addresses this. |
| HMR during edit | Same as above — edit may be lost. |
| Multiple edits on same element before commit | Second edit replaces first in the draft queue (dedup by elementKey). |
| User scrolls during edit | Toolbar repositions via scroll listener. Element stays editable. |
| User resizes window during edit | Toolbar repositions via resize listener. |
| Blur from clicking toolbar | 200ms delay on blur prevents premature confirm. |

---

## Verification

### Manual E2E

1. Start `Dev: Test App`
2. Select an element with text → verify "Edit Text" button appears in toolbar
3. Click "Edit Text" → element becomes editable with teal dashed outline
4. Type new text, bold with Cmd+B, add line break with Enter → verify native editing works
5. Press Cmd+Enter → verify `text-change` patch appears in draft queue
6. Press Escape on a new edit → verify innerHTML reverts, no patch created
7. Commit the patch → verify Mock MCP Client receives text-change instructions with old/new HTML + context

### Scroll + Resize

1. While editing, scroll the page → toolbar tracks the element
2. While editing, resize window → toolbar repositions

### Unit Tests

- `server/queue.ts` — text-change patch dedup by elementKey
- `server/mcp-tools.ts` — `buildCommitInstructions` output includes text-change patches with correct markdown format

---

## Files Changed

| File | Change |
|------|--------|
| `shared/types.ts` | Add `'text-change'` to `PatchKind`, add `originalHtml`/`newHtml` fields, add `TextEditActiveMessage`/`TextEditDoneMessage`, update union types |
| `overlay/src/index.ts` | Add "Edit Text" button to `showDrawButton()`, add `isTextEditing` flag, gate WS message handlers |
| `overlay/src/text-edit.ts` | **NEW** — `startTextEdit()`, `endTextEdit()`, scroll/resize listeners |
| `overlay/src/context.ts` | Add `buildTextContext()` function for text-change annotation |
| `server/queue.ts` | Add text-change dedup logic (by elementKey) |
| `server/mcp-tools.ts` | Add text-change section to `buildCommitInstructions`, update summaries and step instructions |
| `panel/src/App.tsx` | Handle `TEXT_EDIT_ACTIVE`/`TEXT_EDIT_DONE` messages |
| Panel queue components | Render `text-change` patches with "Text edited" label |

---

## Follow-Up: Clone-Based Editing (v2)

To protect against React re-renders and HMR wiping in-progress edits:

1. Clone the element: `targetEl.cloneNode(true)`
2. Position clone with `position: fixed` at the same viewport coords (`getBoundingClientRect()`)
3. Copy computed styles (font, color, background, padding, size) via `getComputedStyle()`
4. Hide original with `visibility: hidden` (preserves layout)
5. Append clone to shadow DOM (isolated from React)
6. Set `contentEditable` on the clone instead of the real element
7. On confirm: update real element's `innerHTML` + send patch
8. Clone can grow freely with `min-width`/`min-height` from original dimensions
9. Add scroll + resize listeners to reposition the clone

This makes text editing immune to framework re-renders and allows the editing area to grow naturally as the user adds content.
