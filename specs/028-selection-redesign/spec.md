# 028 — Selection Redesign

## Problem

Clicking an element currently auto-selects all exact className matches within the same React component. This makes it impossible to:
- Select just one element in isolation
- Add structurally equivalent elements that have different classes (e.g. button variants like Primary, Secondary, Ghost — all `<Button> button[0]` but with wildly different classNames)
- Manually pick specific elements to group together

The existing `+` dropdown shows "near groups" based on class diffs, but in practice the variant buttons never appear — the React-scoped candidate collection finds them, but the user reports zero results despite `MAX_DIFF = 10`. The root cause is under investigation (see Debugging section).

## Current Behavior

1. **Click** → `clickHandler()` in `overlay/src/index.ts` (~L143) calls `findExactMatches()` from `overlay/src/grouping.ts`, finds all elements with identical `tagName + className` within the same React component scope (or page-wide for non-React).
2. All exact matches are highlighted — `state.currentEquivalentNodes` is set to the full `result.exactMatch` array.
3. Toolbar shows `N +` badge via `showDrawButton()` from `overlay/src/element-toolbar.ts`.
4. Clicking `+` → `showGroupPicker()` (~L277 in `element-toolbar.ts`) calls `computeNearGroups()` lazily, grouping candidates by class diff signature, filtered to `totalDiff ≤ MAX_DIFF (10)`.
5. Dropdown shows exact-match summary, "Similar" divider, then group rows with diff tokens (`+added -removed`); hover previews; checkbox toggles add to selection via `updateSelection()`.

### Known Issues Being Debugged

- Button variants (Primary, Secondary, Ghost, etc.) that are all `<Button> button[0]` but with different classNames **do not appear** in the "Similar" dropdown despite having diffs of 6–8 (well within `MAX_DIFF=10`).
- Suspected causes:
  1. `findComponentBoundary` resolves to a wrapper component (not `Button`) that has only one instance — so all variant buttons are candidates, but the React-scoped scan finds them within a single instance and the diff/filter logic is correct, yet something else prevents them from showing.
  2. CSS selector escaping fails for special Tailwind chars (`[`, `/`, `var()`) in the non-React path — though `grouping.ts` now has a `cssEscape()` helper with `CSS.escape` + regex fallback.
  3. The component detection fails entirely on the user's app and falls into the non-React path, where `MAX_CANDIDATES = 200` is hit before the relevant elements are reached.

---

## Proposed Design

### 1. Single-element selection on click

Clicking an element selects **only that element** — not all exact matches. `findExactMatches` is still computed and cached for the dropdown, but not auto-applied.

Badge shows `1 +` initially.

### 2. Expanded `+` dropdown

The `+` dropdown gains three new sections **above** the existing "Similar" section:

```
┌─ Selection ────────────────────────┐
│ [1] element selected               │
│                                    │
│ ─ Add ─                            │
│ [☐] All exact matches (5)          │
│ [☐] All Button > button[0] (6)     │  ← React components only
│ [🎯] Click to add…                │
│                                    │
│ ─ Similar ─                        │
│ [☐] (3) +ring-2 +ring-blue-500    │
│ [☐] (1) -px-4                     │
└────────────────────────────────────┘
```

**All exact matches (N)** — Toggle checkbox. Adds/removes all elements with identical tagName + className within component scope (or page-wide for non-React). Uses cached `findExactMatches` result. Hover shows dashed preview outlines.

**All [path] (N)** — Toggle checkbox. Adds/removes all elements at the same structural position within instances of the same React component. Uses fiber child-path matching (`getChildPath` + `resolvePathToDOM`). Hidden for non-React elements. Hover shows dashed preview outlines.

Path notation uses bracket-index style: `Button > button[0] > span[0]`

**Click to add…** — Enters "add mode." In add mode, clicking any element on the page **adds it to** (or removes it from) the current selection. Exit via Escape or clicking the `+` button again. Cursor shows crosshair while active.

**Similar** — Existing near-groups section (class-diff based), unchanged.

### 3. Shift+click

Holding Shift while clicking any element **always** adds/toggles it in the current selection, regardless of whether add mode is active. Shift+clicking a currently-selected element removes it (toggle).

### 4. Hover preview

Hovering any row in the "Add" section (exact matches, path matches) shows dashed teal outlines on the corresponding elements so the user can see what they'd be adding before checking.

### 5. Deselect individuals

Shift+clicking a currently-selected element removes it from the selection (toggle behavior).

---

## Implementation Plan

### Phase 1 — Single-element selection on click

**File:** `overlay/src/index.ts` — `clickHandler()` (~L143)

- Set `currentEquivalentNodes = [targetEl]` (not `result.exactMatch`)
- Highlight only the clicked element
- Send `ELEMENT_SELECTED` with `instanceCount: 1`
- Cache `result.exactMatch` in a new `state.cachedExactMatches` field so the dropdown can offer "All exact matches (N)" without re-computing

### Phase 2 — Structural path matching

**File:** `overlay/src/fiber.ts` — new `buildPathLabel()`
- Walk from target fiber up to component boundary
- At each level read tag name and sibling index
- Build label like `Button > button[0] > span[0]`
- Return `{ label: string, path: number[] }`

> **Existing code to leverage:** `getChildPath()` already returns `number[]` of sibling indices. `resolvePathToDOM()` follows that path within another instance. `findDOMEquivalents()` (~L319) already locates equivalent DOM nodes across component instances using tag+className descent — this could be adapted or called as a fallback. `findInlineRepeatedNodes()` (~L235) handles the inline `.map()` case.

**File:** `overlay/src/grouping.ts` — new `findSamePathElements()`
- Use `getFiber` + `findComponentBoundary` to get component scope
- Use `getChildPath` for the structural path
- Use `findAllInstances` + `resolvePathToDOM` across all component instances
- Return `{ elements: HTMLElement[], label: string }` or `null` for non-React elements

### Phase 3 — Rebuild `+` dropdown

**File:** `overlay/src/element-toolbar.ts` — `showGroupPicker()` (~L277)
- Add "All exact matches" row with toggle checkbox (below the current exact match summary or replacing it)
- Add "All [path]" row with toggle checkbox (React only)
- Add "Click to add…" button
- Keep existing "Similar" section below
- `updateSelection()` (~L365 in same file) unions element sets from exact-match, path-match, manual-add, and near-groups

### Phase 4 — Click-to-add mode + shift+click

**File:** `overlay/src/overlay-state.ts` — add new state fields:
- `addMode: boolean` (default `false`)
- `manuallyAddedNodes: Set<HTMLElement>` (default empty)
- `cachedExactMatches: HTMLElement[] | null` (stores full exact-match set from Phase 1)

**File:** `overlay/src/index.ts` — modify `clickHandler()` (~L143):
- If `state.addMode` is true: toggle clicked element in `manuallyAddedNodes`, update highlights, skip normal select flow
- If `e.shiftKey`: toggle clicked element in current selection (add if absent, remove if present)
- Reuse existing `setSelectMode()` (~L215) to toggle crosshair cursor
- Exit add-mode: Escape key (modify keydown handler ~L336) or `+` button re-click

### Phase 5 — Update E2E tests

**File:** `test-app/e2e/element-groups.spec.ts`
- Update existing tests for single-element-first behavior (click → 1 highlight, badge `1 +`)
- Add test: open `+` → check "All exact matches" → highlights jump to N
- Add test: check "All [path]" → highlights include all structural matches
- Add test: enter click-to-add mode → click another element → added to selection
- Add test: shift+click adds element to selection
- Add test: shift+click selected element removes it
- Add test: Escape exits add-mode

---

## Decisions

| Decision | Choice |
|---|---|
| `+` dropdown location | Overlay toolbar (not panel) |
| Click-to-add exit | Both Escape and `+` button re-click |
| Exact-match / path-match | Toggle checkboxes (check adds, uncheck removes) |
| Path notation | Bracket-index: `Button > button[0] > span[0]` |
| Existing "Similar" section | Kept below new options |
| Panel-side changes | None needed |
| Non-React structural matching | Deferred (future spec) |
| Multi-class editing (mixed selections) | Needs separate spec; likely restrict to shared/absent properties |

---

## Debugging: Why Don't Similar Groups Appear?

> **Status:** Console logs are already in place in `grouping.ts` (~L160–174). The React path logs component name, tag, and candidate count. The non-React path logs tag and candidate count. No additional instrumentation needed — just open DevTools and reproduce.

### What to check

1. **Does `findComponentBoundary` find `Button` or a wrapper?**
   Check the component name shown in the panel header after clicking. In the console, look for `[grouping] React path — component: <name>` to confirm.

2. **Does `computeNearGroups` find any candidates?**
   Console already logs candidate counts. Look for `[grouping] React path` or `[grouping] Non-React path` messages.

3. **Is the React path or non-React path taken?**
   If you see `[grouping] React path`, fiber detection succeeded. If `[grouping] Non-React path`, fiber detection failed (e.g. Astro, non-standard React root ID). The non-React path caps at `MAX_CANDIDATES = 200`.

4. **CSS escape issue in non-React path?**
   `grouping.ts` has a `cssEscape()` helper (~L33) that uses `CSS.escape` with a regex fallback. This should handle Tailwind's special chars.

### Recommended debug steps

1. Click a Primary button in your app
2. Open DevTools console
3. Check the component name shown in the panel — is it `Button` or something else?
4. Open `+ ▼` dropdown — are there zero rows in the "Similar" section?
5. Read the console logs for candidate count and component path info
