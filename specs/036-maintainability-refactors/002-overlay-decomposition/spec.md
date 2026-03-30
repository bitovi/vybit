# 036-002 — Overlay index.ts Decomposition

## Problem

`overlay/src/index.ts` is 906 lines acting as the overlay's monolithic orchestrator. It handles:

- Shadow DOM creation and initialization (~80 lines in `init()`)
- Container management (popover/modal/sidebar/popup switching)
- Element selection mode (click handler with add-mode, shift+click, normal click — 3 paths)
- Live preview orchestration (`PATCH_PREVIEW`, `PATCH_REVERT`, `PATCH_STAGE`)
- Tab/mode state sync with panel
- WebSocket message handler with **25+ message type branches** (~250 lines)
- Tailwind config fetching and CSS variable resolution (~60 lines)
- Design canvas integration
- Recording engine integration
- Bug report element pick mode
- Escape key handling with 4 exit paths
- Scroll/resize re-highlight handlers

Some extraction has already happened — `overlay-state.ts`, `element-highlight.ts`, `element-toolbar.ts`, `patcher.ts`, `design-canvas-manager.ts` exist as separate modules. But the central `onMessage()` handler and `init()` function remain monolithic.

### Specific Smells

1. **Giant `onMessage()` handler** — 25+ message type branches in a single callback. Adding a new message type means finding the right spot in a 250-line `if/else` chain. Branches have varying amounts of inline logic (some 3 lines, others 30+).

2. **`init()` function** — ~150 lines of sequential setup: Shadow DOM → styles → toolbar callbacks → containers → toggle button → escape handler → WebSocket → message handler → scroll/resize handlers → auto-open → recording. No clear structure separating concerns.

3. **`clickHandler()` function** — ~100 lines with 3 behavioral modes (add-mode, shift+click, normal) that share some state mutations but diverge significantly. The add-mode and shift+click paths both rebuild equivalent nodes and send `ELEMENT_SELECTED`, but with different selection logic.

4. **CSS variable resolution** — `resolveConfigCssVars()`, `resolveColorObject()`, `resolveCssVar()`, `normalizeToHex()` are ~60 lines of DOM-dependent color parsing unrelated to the overlay's core purpose. They're only called once (when sending config to panel).

5. **Bug report pick mode** — `enterBugReportPickMode()` and `buildSelectorPath()` (~60 lines) are a self-contained feature with its own click/keydown handlers bolted onto the top-level file with a module-level `bugReportPickCleanup` variable.

## Proposed Changes

### Phase 1: Extract Message Handler Map

Replace the `if/else` chain in `onMessage()` with a handler map pattern:

**New file:** `overlay/src/message-handlers.ts`

```typescript
type MessageHandler = (msg: any) => void | Promise<void>;

const handlers: Record<string, MessageHandler> = {
  TOGGLE_SELECT_MODE: (msg) => { /* ... */ },
  MODE_CHANGED: (msg) => { /* ... */ },
  TAB_CHANGED: (msg) => { /* ... */ },
  CANCEL_MODE: (msg) => { /* ... */ },
  PATCH_PREVIEW: (msg) => { /* ... */ },
  PATCH_PREVIEW_BATCH: (msg) => { /* ... */ },
  PATCH_REVERT: (msg) => { /* ... */ },
  PATCH_REVERT_STAGED: (msg) => { /* ... */ },
  PATCH_STAGE: (msg) => { /* ... */ },
  CLEAR_HIGHLIGHTS: (msg) => { /* ... */ },
  SWITCH_CONTAINER: (msg) => { /* ... */ },
  INSERT_DESIGN_CANVAS: (msg) => { /* ... */ },
  CAPTURE_SCREENSHOT: (msg) => { /* ... */ },
  DESIGN_SUBMITTED: (msg) => { /* ... */ },
  CLOSE_PANEL: (msg) => { /* ... */ },
  COMPONENT_ARM: (msg) => { /* ... */ },
  COMPONENT_DISARM: (msg) => { /* ... */ },
  DESIGN_CLOSE: (msg) => { /* ... */ },
  RECORDING_GET_HISTORY: (msg) => { /* ... */ },
  RECORDING_GET_SNAPSHOT: (msg) => { /* ... */ },
  RECORDING_GET_RANGE: (msg) => { /* ... */ },
  BUG_REPORT_PICK_ELEMENT: (msg) => { /* ... */ },
};

export function handleMessage(msg: any): void {
  const handler = handlers[msg.type];
  if (handler) handler(msg);
}
```

Each handler will be a small named function. The `index.ts` `onMessage` callback becomes:

```typescript
onMessage(handleMessage);
```

**Dependency injection:** Handlers need access to `state`, `SERVER_ORIGIN`, `btn` (the toggle button), and various imported modules. Pass these as a context object during initialization:

```typescript
export function initMessageHandlers(ctx: {
  state: OverlayState;
  serverOrigin: string;
  toggleButton: HTMLButtonElement;
  recordingEngine: RecordingEngine;
}): (msg: any) => void;
```

### Phase 2: Extract CSS Variable Resolution

**New file:** `overlay/src/css-var-resolver.ts`

Move these functions out of `index.ts`:
- `resolveConfigCssVars(config)`
- `resolveColorObject(obj)`
- `resolveCssVar(value)`
- `normalizeToHex(cssColor)`

These are pure functions (with DOM side effects for color computation) that have no dependency on overlay state.

### Phase 3: Extract Bug Report Pick Mode

**New file:** `overlay/src/bug-report-pick.ts`

Move:
- `enterBugReportPickMode()`
- `buildSelectorPath(el)`
- The module-level `bugReportPickCleanup` variable

This is a self-contained feature that currently adds module-level state to `index.ts`.

### Phase 4: Extract Click Handler

**New file:** `overlay/src/click-handler.ts`

Move `clickHandler()` and refactor its three behavioral modes into named functions:

```typescript
export function createClickHandler(ctx: ClickHandlerContext): (e: MouseEvent) => Promise<void>;

// Internal:
function handleAddModeClick(targetEl: HTMLElement, ctx): void;
function handleShiftClick(targetEl: HTMLElement, e: MouseEvent, ctx): void;
function handleNormalClick(targetEl: HTMLElement, classString: string, ctx): Promise<void>;
```

Each mode becomes independently readable and testable.

### Phase 5: Simplify `init()`

After Phase 1–4, `init()` becomes a sequenced setup function calling well-named initializers:

```typescript
function init(): void {
  createShadowDOM();
  initContainers();
  createToggleButton();
  setupEscapeHandler();
  connectWebSocket();
  setupResizeScrollHandlers();
  restoreSessionState();
  startRecording();
}
```

Each of these is either an existing function or a small new function extracted from the current `init()` body.

## File Impact

| File | Change |
|------|--------|
| `overlay/src/index.ts` | Shrinks from ~906 to ~200–250 lines (init + imports + small glue) |
| `overlay/src/message-handlers.ts` | New (~250 lines, but each handler is isolated) |
| `overlay/src/css-var-resolver.ts` | New (~60 lines) |
| `overlay/src/bug-report-pick.ts` | New (~60 lines) |
| `overlay/src/click-handler.ts` | New (~130 lines) |

## Testing Strategy

1. **CSS variable resolver** — unit testable by mocking `document.createElement` and `getComputedStyle`; test hex normalization, HSL fallback, nested var() resolution
2. **Message handler map** — unit test individual handlers by injecting a mock context; verify each handler calls the expected functions on `state`
3. **Click handler** — test each mode (add, shift, normal) independently with mock state and `sendTo`
4. **E2E smoke test:** select an element, switch containers, preview a class change — verify behavior unchanged

## Out of Scope

- Converting the `state` object to a stricter state machine (see 003 for drop-zone; overlay state is a broader effort)
- Adding message type validation/schemas (see cross-cutting recommendation in overview)
- Refactoring the container system
- Changing the WebSocket protocol
