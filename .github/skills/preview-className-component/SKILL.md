---
name: preview-className-component
description: Build panel UI components that live-preview Tailwind className changes in the user's app via WebSocket. Use when creating any control (dropdown, scrubber, color picker, toggle, etc.) that lets users hover/scrub values before committing. Covers the preview/revert/stage lifecycle, the onHover/onLeave prop contract, and the focus-trap pattern that prevents preview leaks.
---

# Skill: Building Components That Preview className Changes

## Mental Model

Every interactive control in the panel follows a three-phase lifecycle:

```
HOVER → preview (live in user's app)
LEAVE → revert  (snap back to original)
CLICK → stage   (lock the new value as a draft)
```

The control itself only calls `onHover(newClass)` and `onLeave()`. The **parent** (usually `Picker.tsx`) owns the `patchManager` and wires those callbacks to `preview()` / `revertPreview()` / `stage()`.

---

## The `onHover` / `onLeave` Prop Contract

Every control that can preview a class change must accept these two props:

```ts
onHover: (fullClass: string) => void;  // called when a candidate value is highlighted
onLeave: () => void;                   // called when interaction ends without committing
```

**`onHover`** — fire on every discrete candidate value:
- Mouse enters a swatch / list item → `onHover(fullClass)`
- Scrub moves to a new step → `onHover(fullClass)`
- Keyboard navigates to an option → `onHover(fullClass)`

**`onLeave`** — fire when the user abandons the interaction **without** clicking:
- Mouse leaves the entire control
- Dropdown closes without selecting
- Focus leaves the container
- Escape is pressed

The parent wires them:
```tsx
// In Picker.tsx (or wherever patchManager is available)
<MyControl
  onHover={(newClass) => patchManager.preview(currentClass, newClass)}
  onLeave={() => patchManager.revertPreview()}
  onClick={(newClass) => {
    handleStage(property, currentClass, newClass);
    // commitPreview() is called automatically after staging
  }}
/>
```

---

## Dropdown Controls: the Focus-Trap Pattern

Any control with a **dropdown / floating menu** must use `FocusTrapContainer` to guarantee `onLeave` fires in every "escape" scenario (click outside, Tab away, Escape, alt-tab, iframe blur).

**Never use `document.addEventListener('mousedown')`** — it misses keyboard navigation, alt-tab, and window switches. `FocusTrapContainer` handles all of these automatically.

### `FocusTrapContainer` — the shared primitive

```tsx
import { FocusTrapContainer } from '../FocusTrapContainer';

// Wrap any dropdown or floating menu root with it:
{open && (
  <FocusTrapContainer
    className="absolute z-50 top-full left-0 ..."
    onMouseLeave={onLeave}
    onClose={() => { setOpen(false); onLeave(); }}
  >
    {items}
  </FocusTrapContainer>
)}
```

`FocusTrapContainer` is a `<div>` that:
- Accepts all standard `HTMLDivElement` props (className, style, onMouseLeave, etc.)
- Auto-focuses itself on mount so blur events are tracked
- Calls `onClose` when focus leaves the container (`onBlur` + `relatedTarget` check)
- Calls `onClose` when Escape is pressed

`onClose` should close the menu AND call `onLeave()` to revert any active preview.

### Portal dropdowns (e.g., MiniScrubber)

Same pattern — `FocusTrapContainer` works inside `createPortal` too:

```tsx
{open && dropdownPos && createPortal(
  <FocusTrapContainer
    className="bm-mini-dropdown"
    style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
    onMouseLeave={() => onLeave?.()}
    onClose={() => { setOpen(false); onClose?.(); onLeave?.(); }}
  >
    {items}
  </FocusTrapContainer>,
  document.body
)}
```

> **Note for portals**: The dropdown position is set in a separate `useEffect` step. `FocusTrapContainer` auto-focuses on mount, which fires *after* the portal renders at the correct position — no separate focus `useEffect` needed.

### Reference implementations

| Control | File |
|---------|------|
| ScaleScrubber dropdown | `panel/src/components/ScaleScrubber/ScaleScrubber.tsx` |
| MiniScrubber portal dropdown | `panel/src/components/BoxModel/components/MiniScrubber/MiniScrubber.tsx` |
| PropertySection + menu | `panel/src/components/PropertySection/PropertySection.tsx` |
| FocusTrapContainer itself | `panel/src/components/FocusTrapContainer/FocusTrapContainer.tsx` |

---

## Hover-Only Controls (No Dropdown)

Controls that preview on hover but don't have a discrete open/close state (e.g., a color swatch grid) only need `onMouseEnter` / `onMouseLeave` — no focus trap is necessary:

```tsx
<div onMouseLeave={onLeave}>
  {swatches.map((swatch) => (
    <div
      key={swatch.value}
      onMouseEnter={() => onHover(swatch.fullClass)}
      onClick={() => onClick(swatch.fullClass)}
    />
  ))}
</div>
```

---

## Floating UI Color Pickers (Floating Portal)

When using Floating UI (`useFloating` + `useDismiss`), the `onOpenChange` callback is the single cleanup hook. **Always call `revertPreview()` when the picker closes**:

```tsx
const { context } = useFloating({
  open: pickerOpen,
  onOpenChange: (open) => {
    if (!open) {
      setPickerOpen(false);
      patchManager.revertPreview();   // ← required, closes without commit = revert
    }
  },
});
```

---

## The `patchManager` API (quick reference)

Accessed via `usePatchManager()` in `Picker.tsx` and passed down as callbacks:

| Method | When to call |
|--------|-------------|
| `preview(oldClass, newClass)` | User hovers a candidate — sends `PATCH_PREVIEW` over WS |
| `revertPreview()` | User leaves without committing — sends `PATCH_REVERT` over WS |
| `stage(elementKey, property, oldClass, newClass)` | User confirms a value — queues a draft patch |

`preview` is idempotent and safe to call on every mouse-enter/scrub step.
`revertPreview` is a no-op if no preview is active.

---

## Checklist for New Preview Controls

- [ ] Accept `onHover: (fullClass: string) => void` and `onLeave: () => void` props
- [ ] If dropdown: implement focus-trap (`tabIndex={-1}`, `onBlur` + `relatedTarget`, `onKeyDown` for Escape, `useEffect` auto-focus)
- [ ] If hover-only: add `onMouseLeave` on the container
- [ ] Never call `patchManager` directly — let the parent wire callbacks
- [ ] `onClick` always calls the parent's stage handler (not `onHover`)
- [ ] If using Floating UI `useDismiss`: add `revertPreview()` inside `onOpenChange`
- [ ] `onLeave` is called on every non-commit close path (mouse leave, blur, Escape, dismiss)

---

## Reference Implementations

| Control | File | Pattern |
|---------|------|---------|
| ScaleScrubber | `panel/src/components/ScaleScrubber/ScaleScrubber.tsx` | Drag-to-scrub + dropdown with focus trap |
| MiniScrubber | `panel/src/components/BoxModel/components/MiniScrubber/MiniScrubber.tsx` | Portal dropdown with focus trap |
| ColorGrid | `panel/src/components/ColorGrid.tsx` | Hover-only swatch grid |
| Picker.tsx | `panel/src/Picker.tsx` | Wires `patchManager` to all controls; Floating UI color pickers |
