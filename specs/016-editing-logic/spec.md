# 016 — Editing Logic

This spec maps out the dimensions of the editing problem and defines the expected behavior for every combination. It serves as a reference for reasoning about correctness and identifying gaps.

---

## Dimensions

There are four independent dimensions that combine to form any editing scenario:

### D1: Element Matching

When the user clicks an element, the overlay finds all exact-match elements (same tag + identical className). The user can also opt-in near-groups (elements with slightly different classNames) via the dropdown.

| State | Description |
|-------|-------------|
| **Exact match** | All selected elements share identical `className`. |
| **Mixed (near-groups)** | The user checked near-groups in the dropdown, so selected elements have *different* classNames. |

### D2: Edit Operation

What kind of class mutation the user is making.

| State | Description | Example |
|-------|-------------|---------|
| **Add** | A class that wasn't there before. | `[+]` button → pick `gap-4` |
| **Remove** | Delete an existing class entirely. | ✕ on a chip → remove `py-2` |
| **Swap** | Replace one class with another (same property). | Scrub `py-2` → `py-4` |
| **Multi-swap** | Add/remove multiple classes in one logical edit. | Solid `bg-blue-500` → gradient `bg-gradient-to-r from-blue-500 to-green-500` |

### D3: Draft State

What drafts already exist for this element when the edit happens.

| State | Description |
|-------|-------------|
| **Clean** | No prior drafts for this element. |
| **Different property** | Drafts exist but for a different property (e.g. already staged `px-4`, now editing `py-`). |
| **Same property** | A draft already exists for the *same* property (e.g. already staged `py-4`, now scrubbing to `py-6`). |

### D4: Action Type

Whether the user is previewing (ephemeral) or staging (persistent).

| State | Description |
|-------|-------------|
| **Preview** | Hover / scrub — live in the DOM but reverts when the mouse leaves. |
| **Stage** | Click — adds to the draft, persists across interactions. |

---

## Current Behavior

### D1 × D4: Element Matching and Preview/Stage

#### Exact match — Preview

The overlay stores `currentEquivalentNodes[]`. `PATCH_PREVIEW` applies `classList.remove(old) + classList.add(new)` to *all* of them. CSS for the new class is fetched from `/css` and injected. Works correctly.

#### Exact match — Stage

The panel sends `PATCH_STAGE`. The overlay builds context from `currentTargetEl`, sends a single `Patch` to the server. Because all instances share the same class string, a single find-and-replace in source fixes them all. Works correctly.

#### Mixed — Preview

Preview applies `remove(old) + add(new)` to *all* nodes in `currentEquivalentNodes`, including near-group elements. If a near-group element doesn't have `oldClass`, the `remove` is a no-op and `newClass` just gets added. This is roughly correct visually — users see the change applied everywhere.

#### Mixed — Stage

**Problem.** The `PATCH_STAGE` handler only captures context for `currentTargetEl` (the originally clicked element). The patch's `originalClass` and `target.classes` reflect only the clicked element's className. When the agent does a find-and-replace in source, it won't affect elements with different class strings.

---

### D2: Edit Operations

#### Add

The `[+]` button creates `pendingPrefixes` → renders a ghost scrubber → user picks a value → `stage(elementKey, property, '', newClass)`. `originalClass: ''` signals an addition. Works correctly.

#### Remove

**Partial.** The `ColorGrid` already has a remove affordance: a red ✕ cell (rendered via `onRemove` / `onRemoveHover` props) that stages `newClass: ''`. It uses the `bv-orange` (#F5532D) color for the ✕ icon and an orange outline when active. This pattern should be generalized to all chip/scrubber types — there's currently no ✕ button on non-color chips and no "none" option in `ScaleScrubber`.

The underlying protocol supports it: `stage(elementKey, property, currentClass, '')` where `newClass: ''` signals removal. The overlay's `applyPreview` already handles empty `newClass` — it skips the `classList.add`, effectively doing only the remove.

#### Swap

Scrubber hover → `preview(currentFullClass, newFullClass)`. Click → `stage(property, currentFullClass, newFullClass)`. Overlay does `classList.remove(old) + classList.add(new)`. Dedup by `(elementKey, property)` means re-scrubbing the same property overwrites the previous draft. Works correctly.

#### Multi-swap

The GradientEditor handles this by calling `onStage(oldClass, newClass)` *per individual class*. Direction, from, via, to are each separate patches with separate `property` keys. `deriveProps.ts` reconstructs "effective classes" by replaying staged patches on top of parsed classes.

**Problem.** The `PATCH_PREVIEW` protocol only supports *one* `{oldClass, newClass}` pair at a time. For mode transitions (solid → gradient), the compound visual effect can't be previewed atomically — each sub-property previews individually.

---

### D3: Draft State Interactions

#### Clean — no prior drafts

Straightforward. Stage creates a new `Patch`, overlay calls `commitPreview()` to graduate preview CSS into the persistent `committedStyleEl`. No conflicts.

#### Different property, same element

Both patches coexist. Each scrubber shows its own `lockedValue`. `usePatchManager.stage()` deduplicates by `(elementKey, property)`, so unrelated properties don't collide. Works correctly.

#### Same property, same element

`stage()` filters out the existing patch for that `(elementKey, property)` and appends a new one with a new UUID. The overlay receives a fresh `PATCH_STAGE`. On the server, `addPatch()` also deduplicates by `(elementKey, property, status === 'staged')`.

**Subtlety:** After the first stage, `commitPreview()` makes the staged class the DOM baseline. If the user then re-scrubs the same property, the *overlay* treats the staged value as the current DOM state. But the *panel* still passes `cls.fullClass` (the original parsed class from `ELEMENT_SELECTED`) as `originalClass`. This is actually correct — the agent should modify *source code* where the original class still exists.

**Problem:** The `context` HTML built by `buildContext()` uses the *live DOM* (post-stage), so the `context` shows e.g. `class="... py-4 ..."` while `originalClass` says `py-2`. The agent sees a mismatch between the context and the patch instruction.

---

### D4: Preview vs. Stage Details

#### Preview

`sendTo('overlay', { type: 'PATCH_PREVIEW', oldClass, newClass })` → overlay calls `applyPreview()`:
1. Saves original classes on first preview (if `previewState` is null).
2. Restores originals before applying the new swap (prevents accumulation).
3. Fetches CSS for `newClass` from `/css` and injects a `<style>` tag.
4. `previewGeneration` counter guards against async races.

Reverted by `PATCH_REVERT` → restores original class strings.

#### Stage

Panel sends `PATCH_STAGE` with `{id, oldClass, newClass, property}`. Overlay:
1. Builds context via `buildContext()`.
2. Sends `PATCH_STAGED` to the server (full `Patch` with context, component info, target info).
3. Calls `commitPreview()` — graduates preview CSS into the persistent `committedStyleEl`, clears `previewState` so the next preview snapshots the new DOM baseline.
4. Shows a toast "Change staged".

---

## Preview Cleanup Analysis

Every control that calls `patchManager.preview()` must eventually call `patchManager.revertPreview()` (or transition to a `stage()`, which calls `commitPreview()` on the overlay). If it doesn't, the preview class swap stays applied in the user's app DOM.

### How each control cleans up today

#### ScaleScrubber (drag scrubbing)

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Drag scrub → release with value | `handlePointerUp` → `onClick(value)` → parent calls `stage()` → overlay `commitPreview()` | **Yes** — pointer capture guarantees `pointerup` fires. |
| Drag scrub → release at start (no scrub threshold crossed) | `handlePointerUp` toggles dropdown open. `didScrub` is false so no preview was sent. | **Yes** — no cleanup needed. |

**No leak path for drag scrubbing.** Pointer capture ensures `pointerup` always fires on the same element, even if the mouse moves outside the panel iframe.

#### ScaleScrubber (dropdown)

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Hover item in dropdown | `onMouseEnter` → `onHover(val)` → `preview()` | Preview is active. |
| Leave dropdown area | `onMouseLeave` → `onLeave()` → `revertPreview()` | **Yes** — browser fires `mouseleave` reliably. |
| Click item in dropdown | `onClick(val)` → `stage()` then `setOpen(false)` | **Yes** — transitions to stage. |
| Click outside dropdown | `mousedown` listener → `setOpen(false)` + `onLeave()` → `revertPreview()` | **Yes** — document-level listener catches this. |
| **Switch element while dropdown open** | Panel receives `ELEMENT_SELECTED` → Picker re-renders with new `parsedClasses` → `classesKeyRef` change resets UI state. **But nothing calls `revertPreview()`.** | **LEAK.** The old preview stays applied to the old element's DOM nodes. |
| **Panel loses focus / tab switch** | No handler. | **LEAK.** If user focuses another window and the `mousedown`-outside handler hasn't fired, preview persists. |

#### ColorGrid (chip color picker — floating)

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Hover swatch | `onHover` → `preview()` | Preview is active. |
| Mouse leaves grid | `onMouseLeave` on the grid wrapper → `onLeave()` → `revertPreview()` | **Yes.** |
| Click swatch | `onClick` → `stage()` | **Yes** — transitions to stage. |
| Floating dismiss (Escape / click outside) | `useDismiss` → `onOpenChange(false)` → `setChipColorPicker(null)` + `patchManager.revertPreview()` | **Yes** — Floating UI handles Escape and outside click. |
| **Switch element while color picker open** | `classesKeyRef` change → `setChipColorPicker(null)`. State resets, **but the Floating UI `onOpenChange` callback doesn't fire** because the state was set directly. `patchManager.revertPreview()` is in `onOpenChange` but not in the `classesKeyRef` reset. | **LEAK.** |

#### ColorGrid (box model color picker — floating)

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Hover swatch | `onHover` → `preview(currentClass, fullClass)` | Preview is active. |
| Mouse leaves grid | `onLeave` → either snaps back to staged color (if `.staged`) or `revertPreview()` | **Yes** for the non-staged case. For the staged case it sends a corrective preview, which is fine. |
| Click swatch | `onClick` → `stage()` + updates local overrides | **Yes.** |
| Floating dismiss (Escape / click outside) | `useDismiss` → `onOpenChange(false)` → `setBoxModelColorPicker(null)`. **No `revertPreview()` call here.** | **LEAK.** If the user was hovering a swatch and presses Escape, the preview stays. |
| **Switch element** | `classesKeyRef` change → `setBoxModelColorPicker(null)`. Same as chip picker — no revert call. | **LEAK.** |

#### BoxModel MiniScrubber

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Drag scrub → release | `handlePointerUp` → `onClick(value)` → parent's `onSlotChange` → `stage()` | **Yes** — pointer capture. |
| Dropdown hover | `onMouseEnter` → `onHover(val)` → parent's `onSlotHover` → `preview()` | Preview is active. |
| Leave dropdown | `onMouseLeave` → `onLeave()` → parent's `onSlotHover(…, null)` → `revertPreview()` | **Yes.** |
| Click outside dropdown | `mousedown` listener → `onClose()` + `onLeave()` → `revertPreview()` | **Yes.** |
| **Switch element while dropdown open** | Same `classesKeyRef` pattern — MiniScrubber unmounts, but nothing calls `onLeave` during unmount. | **LEAK.** |

#### GradientEditor DirectionPicker

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Hover arrow | `handleDirectionHover` → `preview()` | Preview is active. |
| Leave picker area | `handleDirectionLeave` → `onRevert()` → `revertPreview()` | **Yes** — relies on `onLeave` from DirectionPicker, which should fire `onMouseLeave`. |
| Click arrow | `handleDirectionClick` → `stage()` (one or more calls) | **Yes.** |
| **Switch element** | GradientEditor unmounts and re-mounts with new props. No cleanup effect. | **Likely OK** — `onMouseLeave` should fire on unmount, but not guaranteed in all React versions. **Marginal risk.** |

#### GradientEditor Color Picker (floating)

| Trigger | Cleanup path | Reliable? |
|---------|-------------|-----------|
| Hover swatch | `handleColorHover` → `preview()` | Preview is active. |
| Leave grid | `handleColorLeave` → `onRevert()` → `revertPreview()` | **Yes.** |
| Floating dismiss | `onOpenChange(false)` → `handleCloseColorPicker()` | Need to check if this calls revert. |

### Summary of leak paths

| # | Scenario | Control | Root Cause |
|---|----------|---------|------------|
| **L1** | Switch element while ScaleScrubber dropdown is open | ScaleScrubber | No cleanup on unmount/re-render; `classesKeyRef` change doesn't call `revertPreview()`. |
| **L2** | Switch element while chip color picker is open | Chip ColorGrid (floating) | `classesKeyRef` reset sets state to null but doesn't fire `onOpenChange`, so `revertPreview()` is skipped. |
| **L3** | Switch element while box model color picker is open | BoxModel ColorGrid (floating) | Same as L2, plus `onOpenChange` callback doesn't call `revertPreview()` itself (only sets state). |
| **L4** | Escape / click-outside box model color picker while hovering swatch | BoxModel ColorGrid (floating) | `onOpenChange(false)` sets state to null but doesn't call `revertPreview()`. |
| **L5** | Switch element while MiniScrubber dropdown is open | BoxModel MiniScrubber | Dropdown unmounts without calling `onLeave()`. |
| **L6** | Panel loses focus (alt-tab, devtools) while hovering a dropdown item | All dropdown-based controls | No `blur`/`visibilitychange` handler. |

### Proposed solution: focus-trap pattern for dropdown menus

Replace all manual `mousedown` listeners (ScaleScrubber, MiniScrubber) and Floating UI `useDismiss` callbacks with a unified **focus-trap** pattern. This automatically handles preview cleanup on all forms of attention loss.

#### Pattern: focusable container with `relatedTarget` check

Make each dropdown container focusable (`tabIndex={-1}`) and auto-focus it when opened. Use `onBlur` with `relatedTarget` to detect when focus leaves the menu:

```tsx
<div
  ref={containerRef}
  tabIndex={-1}                           // Focusable but not in tab order
  onBlur={(e) => {
    // Only close if focus moved outside this container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
      onLeave();                           // Calls revertPreview()
    }
  }}
>
  {/* Items inside — focus can move freely among them */}
  {values.map((val) => (
    <div
      key={val}
      onClick={() => {
        onClick(val);
        setOpen(false);
      }}
    >
      {val}
    </div>
  ))}
</div>
```

#### How it works

- **User clicks item inside menu** → Focus moves to item (or stays on container). `relatedTarget` is inside container → `onBlur` condition fails → menu stays open → click handler runs → `stage()` → close menu + `commitPreview()`
- **User clicks outside menu** → Focus moves outside. `relatedTarget` is outside → condition passes → close menu + `revertPreview()`
- **User presses Tab away** → Focus moves outside → condition passes → close menu + revert
- **User presses Escape** → Add a sibling `onKeyDown={(e) => e.code === 'Escape' && (setOpen(false), onLeave())}` on the container
- **User alt-tabs / window switches** → Focus moves out of iframe → `blur` fires → condition passes → close menu + revert
- **User switches element while menu open** → Panel re-renders, old menu unmounts → `blur` fires with `relatedTarget` as the new focused element (outside old container) → cleanup fires

#### Benefits

- **Single unified mechanism** — no more ad-hoc `document.addEventListener('mousedown')` listeners per control
- **Automatic for all cases** — click outside, press Tab, press Escape, alt-tab, window switch, element switch
- **No "leak paths"** — blur fires whenever focus leaves, period
- **Safe at the source** — cleanup happens in the control itself, not via Picker-level guards or overlay listeners
- **Accessible** — follows standard focus-trapping patterns (used by modals, popovers, etc.)
- **Reusable** — make a `<FocusTrap>` wrapper component to apply to all dropdowns, floating pickers, and modals project-wide

#### Implementation checklist

1. Update `ScaleScrubber` — replace `document.addEventListener('mousedown')` with focus trap
2. Update `MiniScrubber` — same replacement
3. Update `ColorGrid` (of floating) — replace `useDismiss` with focus trap (Floating UI still needs to position the portal, but dismiss model changes)
4. Add `onKeyDown` handler for Escape on all three
5. Auto-focus container on open via `useEffect`
6. Remove manual cleanup from Picker's `classesKeyRef` effect (it will be automatic)

---

## Scenarios Matrix

This table shows the expected behavior for key combinations. Cells marked **BUG** or **GAP** are where we fall short.

| D1 | D2 | D3 | D4 | Expected Behavior | Status |
|----|----|----|----|----|--------|
| Exact | Swap | Clean | Preview | Remove old, add new on all nodes. Revert on leave. | OK |
| Exact | Swap | Clean | Stage | Create patch `{original→new}`. Overlay commits preview. | OK |
| Exact | Swap | Same prop | Preview | Preview should swap from *staged* value (DOM), but `originalClass` stays as source value. | OK (correct for agent, slightly confusing visually since locked indicator shows staged value) |
| Exact | Swap | Same prop | Stage | Replace the existing draft. New patch keeps original source class as `originalClass`. | OK (but context HTML is stale — see below) |
| Exact | Add | Clean | Preview | Add new class to all nodes. Revert on leave. | OK |
| Exact | Add | Clean | Stage | Create patch `{''→new}`. | OK |
| Exact | Add | Same prop | Stage | Replace existing add-patch with new value. | OK |
| Exact | Remove | Clean | Preview | Remove class from all nodes. Revert on leave. | **PARTIAL — ColorGrid only** (red ✕ cell works; no affordance on chips/scrubbers) |
| Exact | Remove | Clean | Stage | Create patch `{old→''}`. Agent removes from source. | **PARTIAL — ColorGrid only** (red ✕ cell works; no affordance on chips/scrubbers) |
| Exact | Multi-swap | Clean | Preview | Should preview all swaps atomically. | **GAP — only one pair at a time** |
| Exact | Multi-swap | Clean | Stage | Creates N patches (one per sub-property). | OK (works via GradientEditor) |
| Mixed | Swap | Clean | Preview | Remove old + add new on all nodes (including near-group). | OK visually (near-group nodes missing `old` just get `new` added) |
| Mixed | Swap | Clean | Stage | Single patch with clicked element's context. | **BUG — agent can't apply to near-group elements** |
| Mixed | Any | Any | Stage | Context only captures clicked element. | **BUG — same root cause** |

---

## Identified Issues

### 1. Preview leaks — stuck DOM changes (High)

**Where:** Multiple controls in the panel (ScaleScrubber, ColorGrid, MiniScrubber).

**Summary:** Six identified paths where a preview (`PATCH_PREVIEW`) is sent to the overlay but the corresponding `PATCH_REVERT` never fires, leaving the user's app DOM in a modified state. The most common trigger is selecting a new element while a dropdown or floating color picker is open. See the "Preview Cleanup Analysis" section above for the full audit.

**Fix:** A three-layer approach:
1. **Picker-level:** Call `patchManager.revertPreview()` in the `classesKeyRef` change effect (one line, fixes 4 of 6 paths).
2. **Floating UI callbacks:** Add `patchManager.revertPreview()` to the `boxModelColorPicker` dismiss callback.
3. **Overlay safety net:** Add `document.addEventListener('visibilitychange', …)` that calls `revertPreview()` when the page is hidden.
4. **Component-level defense:** Add `useEffect` cleanup in ScaleScrubber and MiniScrubber that calls `onLeave` on unmount if a dropdown is open.

### 2. Near-group patches are incomplete (High)

**Where:** Overlay `PATCH_STAGE` handler.

When near-group elements are selected, the patch only captures the clicked element's className. The agent has no information about the class variations in the other groups and can't apply changes to them.

**Options:**
- (a) Generate *separate patches* per unique className group — each patch references its own `originalClass` and `target.classes`.
- (b) Send the intersection of classes to the panel and flag the diff groups in the patch context, so the agent can handle them.
- (c) Restrict editing to only the exact-match set — near-groups are for *viewing* scope, not *editing* scope.

### 3. No "remove class" affordance outside ColorGrid (High)

**Where:** Panel UI (Picker, ScaleScrubber, chips).

The `ColorGrid` component already has a working remove affordance — a red ✕ cell (`onRemove` / `onRemoveHover` props) using the `bv-orange` brand color (#F5532D) with an orange outline when active (see `panel/src/components/ColorGrid.tsx`). But non-color chips and `ScaleScrubber` have no way to trigger removal.

**Options:**
- Generalize the red ✕ pattern from `ColorGrid` to a shared component, then add it to each chip / scrubber row.
- Add a "none" entry at the start of scrubber scales.
- Both.

### 4. Multi-swap can't preview atomically (Medium)

**Where:** `PATCH_PREVIEW` protocol + `patcher.ts`.

`PATCH_PREVIEW` accepts a single `{oldClass, newClass}` pair. Mode transitions (solid → gradient) involve multiple class changes that should preview together.

**Options:**
- Introduce `PATCH_PREVIEW_BATCH` with an array of `{oldClass, newClass}` pairs.
- Apply them all in one DOM pass inside `applyPreview`.

### 5. Context HTML uses live DOM, not source-accurate classes (Medium)

**Where:** `context.ts` `buildContext()`.

After staging a change, `commitPreview()` makes the staged class the DOM baseline. The next `PATCH_STAGE` for the same property builds context from the mutated DOM. The agent sees `context` with `py-4` but `originalClass: 'py-2'`.

**Fix:** Snapshot the original className strings at `ELEMENT_SELECTED` time (into `originalClassMap`). Always pass that snapshot into `buildContext()` so context reflects source-accurate classes regardless of how many previews/stages have happened.

### 6. Dedup key correctness (Low — currently safe)

**Where:** `usePatchManager.stage()` and `server/queue.ts addPatch()`.

The dedup key is `(elementKey, property)`. This works because the class parser disambiguates shared prefixes (e.g. `border-` into border-width vs border-color vs border-style via different `property` values). No action needed, but worth noting as an invariant to protect.

---

## Proposed Changes (Priority Order)

1. **Preview cleanup** — Fix the six identified leak paths. The Picker-level `revertPreview()` on element switch is the highest-impact single fix (one line, four paths). The overlay `visibilitychange` listener is the safety net. See "Preview Cleanup Analysis" for exact code.
2. **Remove affordance** — Generalize the red ✕ pattern from `ColorGrid` into a shared component. Add it to chips and scrubbers. Optionally add a "none" entry to scrubber scales. Wire to `stage(property, currentClass, '')`.
3. **Context snapshotting** — Capture `originalClasses[]` at selection time. Use for all `buildContext()` calls.
4. **Near-group editing** — Decide on option (a), (b), or (c) above and implement.
5. **Batch preview** — Add `PATCH_PREVIEW_BATCH` for multi-swap scenarios.
