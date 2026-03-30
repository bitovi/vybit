# 036-004 — App.tsx Simplification

## Problem

`panel/src/App.tsx` is 713 lines in a single `InspectorApp` component that manages 4 orthogonal concerns:

1. **WebSocket connection state** — connect/disconnect, message routing
2. **Element selection state** — elementData, selectionId, selectModeActive
3. **Mode/tab routing** — mode, tabPreference, insertPoint, textEditing
4. **Patch queue display** — merging server draft with local patches, rendering PatchPopover footer

The component has **9 useState hooks** plus `usePatchManager()`, **3 useEffect hooks** (WS connection, escape key, and an implicit dependency on mode), and inline JSX for **5 distinct UI states**: landing page, bug-report mode, "no element selected" (with select-active substate), "element selected", and the queue footer.

### Specific Smells

1. **`useEffect` message handler** — ~70 lines of `if/else` handling 12 message types. Each branch performs different state mutations. The handler closes over `patchManager` (via `handleModeChange` closure), making it non-extractable without refactoring.

2. **Escape key logic appears in 2 places** — once in the `useEffect` handler (deselect element or exit mode) and implicitly via overlay synchronization. The panel sends different messages depending on the current state (CLEAR_HIGHLIGHTS, MODE_CHANGED, CANCEL_MODE) with inline conditionals.

3. **Queue footer JSX** — ~120 lines of inline JSX (2 warning banners + PatchPopover rendering) defined as a `const queueFooter` and duplicated in 4 return branches. The footer's draft-merge logic (~25 lines) combines server + local patches.

4. **5 conditional return branches** — the render function has 5 top-level return blocks gated on `mode === null`, `mode === 'bug-report'`, `!elementData` (with substate), and the main element-selected view. Each branch duplicates the header (ModeToggle + ContainerSwitcher) and footer.

5. **`handleModeChange`** — 15 lines that reset 5 state variables, sync with overlay, and conditionally set `selectModeActive`. Called from onClick handlers and from message handler (with `fromOverlay` flag to avoid echo).

## Proposed Changes

### Phase 1: Extract Message Handler

Create a handler map that takes a dispatch function for state updates:

**New file:** `panel/src/hooks/useAppMessages.ts`

```typescript
export function useAppMessages(deps: {
  setElementData: (data: ElementData | null) => void;
  setSelectionId: React.Dispatch<React.SetStateAction<number>>;
  setSelectModeActive: (active: boolean) => void;
  setMode: React.Dispatch<React.SetStateAction<AppMode>>;
  setTextEditing: (editing: boolean) => void;
  setInsertPoint: (point: InsertPoint | null) => void;
  patchManager: PatchManager;
  handleModeChange: (mode: AppMode, fromOverlay?: boolean) => void;
  handleTabChange: (tabId: string, fromOverlay?: boolean) => void;
}): void {
  // Registers onMessage handler in useEffect, returns cleanup
}
```

The hook encapsulates the message-type → state-update mapping. Each message type becomes a named function (or object entry) instead of an inline `if/else` branch.

### Phase 2: Extract Queue Footer Component

**New file:** `panel/src/components/QueueFooter/QueueFooter.tsx`

Extract the footer JSX and its supporting logic:

```typescript
interface QueueFooterProps {
  wsConnected: boolean;
  patchManager: PatchManager;
  agentWaiting: boolean;
}

export function QueueFooter({ wsConnected, patchManager, agentWaiting }: QueueFooterProps) {
  // Draft merge logic (server + local)
  // Warning banners (no connection, no agent)
  // PatchPopover row (draft, committed, implementing, implemented)
}
```

This eliminates:
- The 25-line draft-merge logic from InspectorApp's render body
- The `queueFooter` const shared across 4 return branches
- The `copyToClipboard` / `execCommandCopy` utility functions (move into QueueFooter or a small util)

### Phase 3: Extract Page Components

The 5 return branches each represent a distinct "page." Extract the landing page and the "no element" state into components:

**New file:** `panel/src/components/LandingPage/LandingPage.tsx`

Contains the 3 large mode-selection buttons (Select, Insert, Bug Report) currently inline in App.tsx (~80 lines of SVG + JSX).

**New file:** `panel/src/components/EmptySelectionView/EmptySelectionView.tsx`

Contains the "Click an element on the page" prompt, selection-mode-active indicator, and the DrawTab/select-button conditional rendering (~100 lines currently inline).

### Phase 4: Simplify Escape Key Handler

The escape key `useEffect` currently has 2 branches with 6 state mutations and 3 WebSocket sends. Consolidate into a single `handleEscape()` function that uses the mode/elementData state machine:

```typescript
function handleEscape() {
  if (elementData) {
    deselectElement();  // clears elementData, sends CLEAR_HIGHLIGHTS, re-enters mode
  } else if (mode !== null) {
    exitMode();  // clears mode/insertPoint/selectModeActive, sends CANCEL_MODE
  }
}
```

`deselectElement()` and `exitMode()` are small named functions that replace the inline state mutations.

## File Impact

| File | Change |
|------|--------|
| `panel/src/App.tsx` | Shrinks from ~713 to ~250–300 lines |
| `panel/src/hooks/useAppMessages.ts` | New (~80 lines) |
| `panel/src/components/QueueFooter/QueueFooter.tsx` | New (~130 lines) |
| `panel/src/components/QueueFooter/index.ts` | New (re-export) |
| `panel/src/components/LandingPage/LandingPage.tsx` | New (~90 lines) |
| `panel/src/components/LandingPage/index.ts` | New (re-export) |
| `panel/src/components/EmptySelectionView/EmptySelectionView.tsx` | New (~110 lines) |
| `panel/src/components/EmptySelectionView/index.ts` | New (re-export) |

## Testing Strategy

1. **QueueFooter** — unit test with mock patchManager: verify draft-merge produces correct list, warning banners show/hide based on props, PatchPopover receives correct counts
2. **useAppMessages** — test with `renderHook`: simulate incoming WS messages, verify correct state setters are called
3. **LandingPage** — Storybook story + unit test: verify mode buttons call `onModeChange` with correct values
4. **Escape handler** — unit test `handleEscape` with different mode/elementData combinations
5. **E2E smoke test:** full flow — landing → select mode → pick element → edit → escape back → verify state resets

## Out of Scope

- Introducing a routing library (React Router, etc.) for mode-based page switching
- Combining mode + elementData + selectModeActive into a state machine (would be a nice follow-up)
- Refactoring `usePatchManager` (separate hook, already reasonably encapsulated)
- Changing the tab system or ModeToggle behavior
