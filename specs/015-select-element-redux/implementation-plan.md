# 015 — Select Elements Redux: Implementation Plan

## Summary of Changes

Replace the current selection model (fiber-path-based matching that finds "equivalent" elements across component instances) with a simpler, more predictable model: **exact className+tagName matching** by default, with a **dropdown showing nearby "class-diff groups"** for broadening the selection.

---

## Phase 1: New Matching Logic in the Overlay

### 1A. New grouping function: `findExactAndNearGroups()`

**File:** `overlay/src/fiber.ts` (or new file `overlay/src/grouping.ts`)

Create a function that, given a clicked element:

1. **Determines scope** — is the element inside a React component?
   - **Yes:** use existing `findComponentBoundary()` + `findAllInstances()` to get all instances of that component, then collect all DOM descendant elements within each instance.
   - **No:** collect all elements on the page with the same `tagName`.

2. **Exact match group** — from the scoped element set, filter to those whose `tagName` AND `className` exactly match the clicked element. This is the default selection.

3. **Near groups (class-diff)** — from the remaining scoped elements (same tagName, different className), compute a class diff against the clicked element's classList:
   - `added`: classes present on the candidate but NOT on the clicked element
   - `removed`: classes present on the clicked element but NOT on the candidate
   - Group candidates by their `{added, removed}` signature (sorted, stringified)
   - Each group becomes a dropdown row: `(count) +added -removed`
   - Sort groups by "similarity" — fewest total diff classes first

**Returns:**
```ts
interface ElementGroup {
  label: string;         // e.g. "+e" or "-a +f" or "(exact match)"
  added: string[];       // classes added vs clicked element
  removed: string[];     // classes removed vs clicked element
  elements: HTMLElement[];
}

interface GroupingResult {
  exactMatch: ElementGroup;
  nearGroups: ElementGroup[];
  componentName: string | null;
}
```

### 1B. Collecting scoped elements

For **React component scope:**
- Walk all component instances (existing `findAllInstances()`)
- For each instance, DFS the fiber subtree collecting all DOM nodes (`getDOMNode()` on HostComponent fibers, tag === 5)
- Filter to same `tagName` as clicked element

For **non-component scope (Astro, plain HTML):**
- Use CSS-selector-based queries (see 1C) across the whole page
- Filter out elements inside the overlay shadow DOM

This replaces the current approach which uses `getChildPath()` + `resolvePathToDOM()` (index-based fiber path matching).

### 1C. Query strategy for performance (non-React / page-wide scan)

Native `querySelectorAll` with class selectors is extremely fast (browser engine C++ code), so we lean on it heavily and keep JS-side work minimal.

**Step 1 — Exact match + supersets (1 query):**
```
querySelectorAll('div.a.b.c.d')
```
This returns every `<div>` that has **at least** classes `a b c d`. Partition results:
- **Exact match:** elements whose `className` string is identical to the clicked element
- **Supersets:** elements with the same classes plus extras → these become `+added` groups

**Step 2 — "Drop one" removal queries (N queries, one per class):**
For each class `c_i` in the clicked element, query with all classes *except* `c_i`:
```
querySelectorAll('div.a.b.d')   // dropped c
querySelectorAll('div.a.c.d')   // dropped b
querySelectorAll('div.b.c.d')   // dropped a
querySelectorAll('div.a.b.c')   // dropped d
```
Each query finds elements missing that one class (which may also have additions). Subtract the exact-match set, then group by diff signature.

**Step 2B — "Drop two" removal queries (N×(N−1)/2 queries):**
For each pair of classes `(c_i, c_j)`, query with all classes except both:
```
querySelectorAll('div.c.d')     // dropped a, b
querySelectorAll('div.b.d')     // dropped a, c
querySelectorAll('div.b.c')     // dropped a, d
querySelectorAll('div.a.d')     // dropped b, c
...
```
This catches groups like `-px-4 -py-2` (both spacing classes swapped), which is common in Tailwind. Subtract results already found in Steps 1–2, then group by diff signature.

Query counts by class count:

| Classes (N) | Step 1 | Step 2 (drop 1) | Step 2B (drop 2) | **Total** |
|:-----------:|:------:|:----------------:|:----------------:|:---------:|
| 4           | 1      | 4                | 6                | **11**    |
| 6           | 1      | 6                | 15               | **22**    |
| 8           | 1      | 8                | 28               | **37**    |
| 10          | 1      | 10               | 45               | **56**    |
| 12          | 1      | 12               | 66               | **79**    |

All native CSS queries — sub-millisecond total even at 80 queries on a large DOM.

**Step 3 — Group & threshold:**
- Group candidates by `{added, removed}` signature (sorted, stringified)
- **Discard** groups where `added.length + removed.length > 3` — too dissimilar to be useful
- Sort remaining groups by total diff size (ascending)

**Single-class guard:** If the clicked element has only 1 class (`x`), skip Steps 2/2B entirely (nothing to drop). Only show the exact-match group and superset groups from Step 1. If the element has exactly 2 classes, skip Step 2B (dropping both leaves no required classes).

**Complexity:** For an element with N classes:
- **Queries:** $1 + N + \binom{N}{2}$ (typically 22–56 for Tailwind elements with 6–10 classes)
- **JS work:** set partitioning + grouping — O(results) per query, dedup via `Set`
- **Total:** sub-millisecond on any realistic page

For React-scoped elements, the same logic applies but operates on the pre-collected DOM node set from the fiber walk instead of `querySelectorAll`.

---

## Phase 2: Rewire `clickHandler` in the Overlay

**File:** `overlay/src/index.ts`

### Current flow:
1. Click → `findComponentBoundary()` → `findAllInstances()` → `getChildPath()`/`resolvePathToDOM()` per instance → highlight all equivalent nodes
2. Fallback: `findInlineRepeatedNodes()` or `findDOMEquivalents()`

### New flow (lazy — groups computed on demand):
1. Click → run **only Step 1** from Phase 1C: `querySelectorAll('tag.a.b.c.d')` → partition exact matches
2. Highlight `exactMatch` elements
3. Send `ELEMENT_SELECTED` with the exact-match count
4. Show toolbar: `[✏️ draw] | [5] [+ ▼]` — the `+ ▼` button is present but groups are **not yet computed**
5. When user clicks `+ ▼` → **then** run Steps 2/2B/3 (drop-1, drop-2, grouping) and populate the dropdown
6. Cache the computed groups so reopening the dropdown doesn't requery

This keeps the click path fast (1 native CSS query) and defers the heavier group computation until the user actually wants it.

### Changes:
- Remove or gate off the `findInlineRepeatedNodes()` fallback path (the new exact-match logic subsumes it)
- Remove `getChildPath()`/`resolvePathToDOM()` from the click path (keep the functions — they may be useful elsewhere)
- The `currentEquivalentNodes` array now holds only the exact-match group by default
- Store computed `nearGroups` in a module-level variable (populated lazily on first `+ ▼` click)

---

## Phase 3: Toolbar & Group Dropdown

**File:** `overlay/src/index.ts` (functions: `showInstancePicker` → replaced, `showDrawButton` → updated)

### Toolbar layout:
```
[✏️ draw] | [5] [+ ▼]
```
- **Draw button** — unchanged (opens draw/screenshot popover)
- **Count badge** (`5`) — shows current selected element count. Updates live as groups are toggled.
- **`+ ▼` button** — opens the group dropdown. Hidden if no near-groups exist (computed lazily on first click).

### Group dropdown (opens on `+ ▼` click):

On first open, runs the drop-1/drop-2 queries from Phase 1C, then caches the results.

- **Group rows only** — no exact-match row (those are already selected and locked in)
- Each row: `(count) +added -removed` with colored diff tokens (+green, -red)
- Checkbox per row — toggling immediately updates highlights and count badge
- If no groups found, show a brief "No similar elements" message

### Row format:
```
☐ (3) +ring-2 +ring-blue-500        ← classes added vs the clicked element
☐ (1) -px-4                         ← class removed vs the clicked element
☐ (2) +font-bold -text-gray-500     ← mixed add/remove
```

### Hover preview:
- When the user **hovers** a group row (mouseenter), temporarily highlight that group's elements on-page with a distinct preview style (dashed teal border, no animation)
- On **mouseleave**, remove the preview highlights (current selection highlights remain)
- This lets users see exactly which elements a group corresponds to before toggling

### Implementation:
- Add a new CSS class `.highlight-preview` — dashed teal border, no animation (to distinguish from the solid pulsing selection highlight)
- On `mouseenter` of a group row → create `.highlight-preview` overlays for that group's elements
- On `mouseleave` → remove all `.highlight-preview` overlays
- On checkbox change → add/remove that group's elements from `currentEquivalentNodes`, redraw solid `.highlight-overlay` highlights, update count badge

---

## Phase 4: WebSocket Message Updates

**File:** `shared/types.ts`

### New message type: `ELEMENT_GROUPS`

```ts
export interface ElementGroupInfo {
  label: string;
  added: string[];
  removed: string[];
  count: number;
}

export interface ElementGroupsMessage {
  type: 'ELEMENT_GROUPS';
  to: 'panel';
  groups: ElementGroupInfo[];
}
```

This message is sent from overlay → panel right after `ELEMENT_SELECTED`, so the panel can display the groups if it wants to render its own version of the dropdown in the future.

### Update `ELEMENT_SELECTED`

No structural changes needed — `instanceCount` already communicates how many elements are selected. The panel receives the exact-match count initially.

When the user toggles groups in the overlay dropdown, send an updated `ELEMENT_SELECTED` (or a lighter `SELECTION_UPDATED` message) with the new total count.

---

## Phase 5: Panel-Side Updates (Minimal)

**File:** `panel/src/App.tsx`, `panel/src/Picker.tsx`

The group dropdown lives **in the overlay** (rendered in the shadow DOM, positioned near the element toolbar), so the panel doesn't need to render the dropdown itself.

However, the panel should:
- Update the instance count badge when `SELECTION_UPDATED` arrives
- Optionally display group info if we later want the panel to show a selection summary

---

## Phase 6: Cleanup & Testing

### Remove dead code:
- `selectedInstanceIndices` — no longer needed (groups replace per-instance picking)
- The numbered instance picker logic (`showInstancePicker`) — replaced entirely
- The `addingMode` / "+" button — reconsider if still needed (groups cover most multi-select cases)

### Unit tests:
- `findExactAndNearGroups()` — test with mock DOM trees:
  - Same component with identical elements → single exact group
  - Same component with class variations → correct diff groups
  - Non-component page-wide scan
  - Edge cases: no classes, single element, element with no matches

### E2E tests:
- Click element → verify exact matches are highlighted
- Open group dropdown → verify groups listed with correct diffs
- Hover group row → verify preview highlights appear
- Check group → verify highlights update
- Uncheck group → verify highlights revert

---

## File Change Summary

| File | Changes |
|------|---------|
| `overlay/src/fiber.ts` (or new `grouping.ts`) | New `findExactAndNearGroups()`, helper to collect scoped elements |
| `overlay/src/index.ts` | Rewire `clickHandler`, replace `showInstancePicker` with group dropdown, add hover preview highlights, new CSS for `.highlight-preview` |
| `shared/types.ts` | Add `ElementGroupsMessage`, `ElementGroupInfo` types |
| `panel/src/App.tsx` | Handle `SELECTION_UPDATED` message (count change) |
| `panel/src/Picker.tsx` | Update instance count display on selection changes |

---

## Questions

1. **Should the "+" (add different element) button survive?**
   *Suggested answer:* Remove it — the new group dropdown covers "nearby" elements, and cross-component multi-select was rarely used. If a user needs to select truly unrelated elements, they can queue separate patches.

   Remove it. 

2. **Where should the group dropdown live — overlay shadow DOM or panel iframe?**
   *Suggested answer:* Overlay shadow DOM (same as current instance picker), positioned near the toolbar. The overlay has direct access to the DOM elements for hover preview. The panel can receive group info via WS if we want to mirror it later.

   Yes to suggested answer

3. **For the React component scope: should we collect elements from ALL instances of the component, or only from the clicked instance?**
   *Suggested answer:* All instances — the whole point is "find every `<div class="a b c d">` across all `<TabGroup>` components on the page." This matches the spec's example.

   All instances

4. **How should we handle dynamic/conditional classes (e.g. `active`, `hover:`, responsive prefixes)?**
   *Suggested answer:* Compare raw `className` strings as-is (what's in the DOM at click time). Tailwind variants like `hover:` are compiled away at build time and won't appear in `className`. State classes like `active` will naturally create diff groups (e.g. `(1) +active`), which is actually useful — users can see and opt into them.

   As-is comparison. But I'm not sure `hover:` is actually compiled away.  

5. **Should the exact-match row in the dropdown be uncheckable (always selected), or should users be able to deselect it?**
   *Suggested answer:* Always checked and not uncheckable — you always want to edit at least the element you clicked. Users expand the selection by adding groups, not by removing the base group.

   We wouldn't show this exact match row.  We already selected all the exact matches.  You can't change that. 

6. **What happens when the user clicks a new element — does it reset the group selection?**
   *Suggested answer:* Yes, a new click replaces the entire selection (exact match of the new element). The group dropdown repopulates for the new element's context.

    To be clear, if a user clicks the page again immediately after clicking the element, the click will do whatever the app would do in that case. 

   A user has to click the "select element" button again to select different elements.

7. **Scope for non-React pages: scanning the whole page could be expensive. Should we limit the scan?**
   *Suggested answer:* Not a concern. The CSS-selector query strategy (Phase 1C) uses native `querySelectorAll` which is near-instant even on large DOMs. We run 1 + N queries (N = class count on clicked element, typically 6–10). The single-class guard prevents degenerate cases. A max-diff threshold of 3 discards noise. No artificial cap needed.

