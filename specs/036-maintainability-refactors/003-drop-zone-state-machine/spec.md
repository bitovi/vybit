# 036-003 — Drop-Zone State Machine

## Problem

`overlay/src/drop-zone.ts` is 822 lines implementing a component drop-zone system using **15+ module-level boolean/variable flags** as an implicit state machine. The flags include:

```typescript
let active = false;
let elementSelectMode = false;
let browseMode = false;
let insertCallback: InsertCallback | null = null;
let elementSelectCallback: ElementSelectCallback | null = null;
let browseOnLocked: ((target: HTMLElement, position: DropPosition) => void) | null = null;
let lockedTarget: HTMLElement | null = null;
let lockedPosition: DropPosition | null = null;
// ... plus componentName, storyId, ghostHtml, componentPath, componentArgs,
//     cursorLabelEl, indicatorEl, arrowLeftEl, arrowRightEl, currentTarget, currentPosition, overlayHost
```

### Invalid State Combinations

The boolean flags allow impossible states:
- `active=true` + `elementSelectMode=true` + `browseMode=true` (all three modes "on")
- `elementSelectMode=true` + `insertCallback != null` (element-select AND generic insert)
- `active=false` but `lockedTarget != null` (locked indicator orphaned after cleanup)

Currently these don't occur in practice because callers follow an implicit protocol, but there's no enforcement — any new call site could trigger invalid combinations.

### Specific Smells

1. **5 arming functions** with overlapping setup logic — `armInsert()`, `armGenericInsert()`, `armElementSelect()`, `startBrowse()`, `replaceElement()` all set `active = true`, create cursor labels, attach event listeners, but with slight variations.

2. **Duplicate mouse handlers** — `onMouseMove()` and `onMouseMoveElementSelect()` share 90% of their code (cursor label positioning, target finding) but diverge on indicator vs outline rendering.

3. **`onClick()` handles 4 modes** — element-select, browse, generic insert, component-drop — as nested conditionals in a single 80-line function.

4. **`renderIndicator()` called from 2 contexts** — hover indicators and locked indicators use the same function with different style options, but arrow creation/cleanup is managed separately for each.

5. **`cleanup()` must know mode** — checks `wasElementSelect` to decide which event listeners to remove. This is fragile; adding a new mode means updating `cleanup()`.

## Proposed Changes

### Phase 1: Define State Enum

Replace the boolean flags with a discriminated union:

```typescript
type DropZoneMode =
  | { kind: 'idle' }
  | { kind: 'component-insert'; componentName: string; storyId: string; ghostHtml: string; componentPath: string; componentArgs: Record<string, unknown> }
  | { kind: 'generic-insert'; label: string; callback: InsertCallback }
  | { kind: 'element-select'; label: string; callback: ElementSelectCallback }
  | { kind: 'browse'; onLocked: ((target: HTMLElement, position: DropPosition) => void) | null };
```

A single `let mode: DropZoneMode = { kind: 'idle' }` replaces `active`, `elementSelectMode`, `browseMode`, `insertCallback`, `elementSelectCallback`, `browseOnLocked`, `componentName`, `storyId`, `ghostHtml`, `componentPath`, `componentArgs`.

### Phase 2: Unify DOM Element State

Group the indicator/cursor DOM elements into a tracked set:

```typescript
interface DropZoneDOM {
  overlayHost: HTMLElement;
  cursorLabel: HTMLElement | null;
  indicator: HTMLElement | null;
  arrowLeft: HTMLElement | null;
  arrowRight: HTMLElement | null;
  outlineEl: HTMLElement | null;  // element-select only
}

interface LockedIndicatorDOM {
  indicator: HTMLElement | null;
  arrowLeft: HTMLElement | null;
  arrowRight: HTMLElement | null;
  target: HTMLElement | null;
  position: DropPosition | null;
}
```

This replaces 11 separate `let` variables with 2 structured objects, making cleanup exhaustive by construction.

### Phase 3: Consolidate Mouse Handlers

Replace `onMouseMove()` and `onMouseMoveElementSelect()` with a single handler that branches on `mode.kind`:

```typescript
function onMouseMove(e: MouseEvent): void {
  updateCursorLabel(e);
  const target = findTarget(e.clientX, e.clientY);
  if (!target) { hideAll(); return; }

  switch (mode.kind) {
    case 'element-select':
      showElementSelectOutline(target);
      break;
    case 'component-insert':
    case 'generic-insert':
    case 'browse':
      showDropIndicator(target, e);
      break;
  }
}
```

Similarly, consolidate `onMouseLeave()` and `onMouseLeaveElementSelect()` into one handler.

### Phase 4: Extract `onClick` into Mode-Specific Handlers

Replace the monolithic `onClick()` with dispatch:

```typescript
function onClick(e: MouseEvent): void {
  switch (mode.kind) {
    case 'element-select': return handleElementSelectClick(e);
    case 'browse': return handleBrowseClick(e);
    case 'generic-insert': return handleGenericInsertClick(e);
    case 'component-insert': return handleComponentInsertClick(e);
  }
}
```

Each handler is 15–25 lines instead of sharing 80 lines of nested conditionals. 

### Phase 5: Simplify Cleanup

`cleanup()` becomes mode-aware via the enum — no need to check `wasElementSelect`:

```typescript
function cleanup(): void {
  const prevKind = mode.kind;
  mode = { kind: 'idle' };
  document.documentElement.style.cursor = '';
  
  // Remove event listeners (same for all modes)
  document.removeEventListener('mousemove', onMouseMove);
  document.documentElement.removeEventListener('mouseleave', onMouseLeave);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown);
  
  // Remove DOM elements
  removeDOMElements(dom);
}
```

Since we use a single `onMouseMove` now, there's no branching.

### Phase 6: Unify Arming Functions

The 4 arming functions (`armInsert`, `armGenericInsert`, `armElementSelect`, `startBrowse`) share a common initialization pattern:

```typescript
function arm(newMode: DropZoneMode, shadowHost: HTMLElement, label: string): void {
  if (mode.kind !== 'idle') cleanup();
  mode = newMode;
  dom.overlayHost = shadowHost;
  document.documentElement.style.cursor = 'crosshair';
  dom.cursorLabel = createCursorLabel(label);
  
  if (newMode.kind === 'element-select') {
    dom.outlineEl = createOutlineElement();
  } else {
    dom.indicator = createIndicatorElement();
  }
  
  document.addEventListener('mousemove', onMouseMove);
  document.documentElement.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}
```

The public API functions become thin wrappers:

```typescript
export function armInsert(msg: InsertMsg, shadowHost: HTMLElement): void {
  arm({ kind: 'component-insert', ...msg }, shadowHost, `Place: ${msg.componentName}`);
}

export function armElementSelect(label: string, shadowHost: HTMLElement, callback: ElementSelectCallback): void {
  arm({ kind: 'element-select', label, callback }, shadowHost, label);
}
```

## File Impact

| File | Change |
|------|--------|
| `overlay/src/drop-zone.ts` | Restructured; similar line count but clear state transitions |

The refactor is entirely internal to `drop-zone.ts`. The public API (`armInsert`, `armGenericInsert`, `armElementSelect`, `startBrowse`, `cancelInsert`, `replaceElement`, `getLockedInsert`, `clearLockedInsert`, `isActive`) stays identical.

## Testing Strategy

1. **State transitions** — unit test that calling `armInsert` when in `element-select` mode first cleans up, then enters the new mode
2. **Invalid states** — verify `isActive()` returns correct value for each mode
3. **Cleanup completeness** — verify that after `cleanup()`, all DOM elements are removed and mode is `idle`
4. **Public API contract** — mock the host element and verify each arming function sets the correct mode and creates the correct DOM elements
5. **E2E smoke test:** arm a component, hover to see indicator, click to place, verify patch is staged

## Out of Scope

- Changing the public API of drop-zone.ts (callers in index.ts stay unchanged)
- Adding drag-and-drop support  
- Rethinking the browse → locked → use flow (valid design, just needs cleaner internals)
- Adding scroll-position updates for locked indicators (separate feature)
