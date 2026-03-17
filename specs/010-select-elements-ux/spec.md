# 010 — Select Elements UX

## Overview & Motivation

The current VyBit toggle button combines two concerns — panel visibility and element selection — into a single click. This creates confusion: users can't have the panel open without the crosshair cursor, and closing the panel clears their selection. Additionally, the plain ⊕ button doesn't communicate that VyBit is an AI-powered tool.

This spec decouples these concerns and introduces:

1. **Redesigned VyBit toggle** — AI-glow branding, only toggles panel visibility
2. **Select-element button** — inside the panel header, Chrome DevTools-style
3. **Hover preview** — teal outline + component tooltip while in selection mode
4. **Multi-select UX** — add matching instances or different elements after initial selection
5. **Keyboard shortcut** — `⌘ Shift C` / `Ctrl Shift C` to toggle selection mode

See [select-elements-prototype.html](./select-elements-prototype.html) for the interactive visual prototype.

---

## Vocabulary

| Term | Definition |
|---|---|
| **VyBit toggle** | Floating button (bottom-right of page) that opens/closes the inspector panel. Replaces the current ⊕ button. |
| **Selection mode** | A transient state where the overlay intercepts clicks and shows hover previews. Activated from the panel's select-element button or keyboard shortcut. |
| **Hover preview** | Lightweight visual feedback (2px teal outline + tooltip) shown when hovering over elements while selection mode is active. |
| **Select-element button** | A button in the panel header (cursor-in-box icon) that toggles selection mode. |
| **Matching instances** | Other React component instances of the same type as the selected element (found via fiber traversal). |
| **Mixed selection** | When the user adds elements from different component types. Disables the Design tab. |
| **Action bar** | A secondary toolbar row below the panel header, shown after element selection, with options to expand the selection. |

---

## User Flow

```
1. User visits page → VyBit toggle visible (bottom-right, AI glow animation)
2. User clicks VyBit toggle → panel opens, shows empty state
   └─ Toggle changes to "active" state (glow intensifies)
3. User clicks select-element button in panel header (or presses ⌘⇧C)
   └─ Selection mode activates: cursor → crosshair, overlay listens for clicks
   └─ Panel shows "● Selecting… click an element" status
4. User hovers over page elements → teal outline + tooltip preview
   └─ Tooltip shows: <ComponentName> tag.className
5. User clicks an element → element selected
   └─ Selection mode auto-deactivates (cursor returns to normal)
   └─ Panel renders: component name, instance count, action bar, Design tab
   └─ All matching instances are highlighted on the page
6. User optionally expands selection:
   a. "All N Matching" → selects all instances of the same component
   b. "Pick Specific…" → opens instance picker popover with checkboxes
   c. "+ Different Element" → re-enters selection mode to add a non-matching element
7. If mixed selection (different component types):
   └─ Design tab disabled (tooltip: "Design is disabled for mixed selections")
   └─ Message tab active — user can write instructions referencing all selected elements
8. User edits properties / writes messages → queues changes as usual
```

---

## VyBit Toggle Button

### Behavior Change

| | Current | New |
|---|---|---|
| **Click** | Toggles selection mode + panel | Toggles panel open/close only |
| **Active state** | Orange fill (selection active) | AI glow (panel is open) |
| **Icon** | ⊕ text character | Sparkle/stars SVG icon |
| **Selection mode** | Coupled to toggle | Independent — activated from panel |

### AI Glow Options

Four design variants are explored in the prototype (Section 1):

| Option | Style | Animation | Best For |
|---|---|---|---|
| **A — Gradient Halo** | Rotating conic-gradient border (teal→orange) | `halo-spin` 4s → 1.5s when active | Strongest AI signal; recommended |
| **B — Breathing Pulse** | Pulsing box-shadow | `pulse-breathe` 3s idle → `pulse-active` 2s | Subtle/calm aesthetic |
| **C — Shimmer Sweep** | Diagonal gradient highlight sweep | `shimmer-sweep` 4s → 2s | Quietest option |
| **D — Orbiting Dots** | Two dots (teal + orange) orbit the border | `orbit-spin` 6s → 2.5s | Agent-like aesthetic |

**Recommendation:** Option A (Gradient Halo) — most recognizable as an AI tool (matches Copilot, ChatGPT, Cursor patterns).

---

## Panel Header

### Layout

Single-row header with three zones:

```
┌──────────────────────────────────────────────────────┐
│ [🔍] │ ComponentName — N instances │ [⌘⇧C] [⊞] │
│ select │ info area (flex: 1) │ container │
└──────────────────────────────────────────────────────┘
```

### Select-Element Button

- **Icon:** Cursor-in-box SVG (matches Chrome DevTools "inspect element" icon)
- **Size:** 28 × 28px, border-radius 5px
- **States:**
  - Default: `border: var(--border)`, `color: var(--text-mid)`
  - Hover: `border: var(--teal)`, `color: var(--teal)`, `background: var(--teal-dim)`
  - Active (selecting): `background: var(--teal)`, `color: white`
- **Tooltip:** "Select an element (⌘⇧C)"

### Keyboard Shortcut

- **Mac:** `⌘ Shift C`
- **Win/Linux:** `Ctrl Shift C`
- **Behavior:** Toggles selection mode on/off. If the panel isn't open, it opens first.
- **Note:** Mirrors Chrome DevTools' inspect-element shortcut.

---

## Hover Preview

When selection mode is active, hovering over elements on the page shows:

### Visual Treatment
- **Outline:** 2px solid `var(--teal)` with 1px offset
- **Tooltip:** Positioned above the element, dark background (`var(--teal-dark)`)
  - Format: `<ComponentName> tag.firstClass`
  - Example: `<ProductCard> div.card`
- **No background tint** — keep it lightweight, the full highlight only appears after clicking

### Excluded Elements
- The VyBit toggle button itself
- The panel container (shadow DOM)
- iframes
- Elements smaller than 10 × 10px

### Performance
- Uses `mousemove` event on document (throttled to 16ms / 60fps)
- Only recalculates when the element under the cursor changes
- Reuses the existing `getFiber()` / `findComponentBoundary()` logic

---

## Multi-Select / Matching Elements

### After Initial Selection

Three UX options explored (see prototype Section 4):

#### Option A — Header Buttons (Compact)
After selecting one element, show inline buttons next to the instance count:
- `[All 10]` — select all matching instances
- `[+ Add]` — re-enter selection mode

Best for: narrow panels (popover, sidebar).

#### Option B — Instance Picker Popover
Click the instance count to open a popover:
- Checkbox list of all instances
- Each row: [checkbox] [mini-preview] [text content] [location tag]
- "Select All" / "None" toggle
- "Apply (N selected)" button

Best for: precise control when many instances exist.

#### Option C — Inline Action Bar (Recommended)
A secondary toolbar row below the header:
- `[All 10 Matching]` — primary CTA
- `[Pick Specific…]` — opens instance picker
- `[+ Different Element]` — re-enters selection mode for a non-matching element

Best for: discoverability; all actions visible without hidden triggers.

#### Option D — On-Page Overlay Menu (Anchored to Element)
Instead of putting multi-select controls in the panel, anchor them to the selected element on the page:
- A floating toolbar appears at the top-left of the highlighted element, alongside the existing ✏️ draw button
- Controls: `[✏️]` | `[All 10]` `[☰ Pick…]` `[+]`
- Clicking "Pick…" opens an instance-picker popover right on the page (drops down from the button)
- Clicking "+" re-enters selection mode with an orange "adding element" indicator; existing selection stays highlighted (dimmed)
- Each matching instance gets a numbered badge at its corner for spatial awareness

Best for: keeping the user's attention on the page rather than the panel. Especially valuable when the panel is in sidebar mode and the user's gaze is on the page content.

**Not mutually exclusive:** Option D can coexist with A/B/C — the on-page toolbar handles quick actions while the panel header mirrors them for accessibility.

**Recommendation:** Option D for on-page interaction + Option C (or A) mirrored in panel header.

### Mixed Selection (Non-Matching Elements)

When the user adds elements from different component types:

- **Design tab:** Disabled (tooltip: "Design is disabled for mixed selections")
- **Message tab:** Active — user can write contextual instructions for the AI agent
- **Header:** Shows all component names with badges: `Button — 1 instance + Card — 1 instance`
- **Draw tab:** Disabled (can only draw relative to a single element)

---

## New Message Types

### Overlay → Panel

| Message | When | Payload |
|---|---|---|
| `ELEMENT_HOVER` | Mouse enters an element during selection mode | `{ componentName, tagName, className, rect: DOMRect }` |
| `ELEMENT_HOVER_LEAVE` | Mouse leaves element or exits selection mode | `{}` |

### Panel → Overlay

| Message | When | Payload |
|---|---|---|
| `TOGGLE_SELECT_MODE` | User clicks select button or presses shortcut | `{ active: boolean }` |
| `SELECT_MATCHING` | User clicks "All N Matching" | `{ all: true }` or `{ indices: number[] }` |
| `ADD_ELEMENT` | User clicks "+ Different Element" | `{}` (re-enters selection mode) |

### Overlay → Panel (enhanced ELEMENT_SELECTED)

The existing `ELEMENT_SELECTED` message adds a `selectionId` field for tracking multi-select:

```typescript
{
  type: 'ELEMENT_SELECTED',
  to: 'panel',
  selectionId: string;          // unique ID for this selection
  componentName: string;
  instanceCount: number;
  classes: string;
  tailwindConfig: any;
  // New: instances metadata for the picker
  instances?: Array<{
    index: number;
    textContent: string;        // first 50 chars of innerText
    parentComponent: string;    // parent component name for location context
  }>;
}
```

---

## Implementation Phases

### Phase 1 — VyBit Toggle (Visual Only)
- Replace ⊕ with sparkle SVG icon
- Add AI glow CSS animation (Option A — Gradient Halo)
- Keep existing toggle behavior (still coupled to selection mode)
- **Verification:** Button renders with animated glow, hover/active states work

### Phase 2 — Decouple Toggle from Selection
- Toggle only opens/closes the panel container
- Add `TOGGLE_SELECT_MODE` message handler in overlay
- Selection mode activated by message from panel, not by toggle
- **Verification:** Can open panel without entering selection mode; can toggle selection independently

### Phase 3 — Panel Header Redesign
- Add select-element button to panel header (App.tsx)
- Implement keyboard shortcut listener (`⌘⇧C` / `Ctrl⇧C`)
- Show selection mode status ("● Selecting…") in header
- Auto-deactivate selection mode after element click
- Add `Esc` to cancel
- **Verification:** Full selection flow works: panel open → click select → hover → click element → panel shows data

### Phase 4 — Hover Preview
- Add `mousemove` handler in overlay (throttled) during selection mode
- Show teal outline on hovered element
- Position tooltip with component name + tag
- Send `ELEMENT_HOVER` / `ELEMENT_HOVER_LEAVE` messages (optional, for panel status)
- **Verification:** Hover preview appears/disappears smoothly; tooltip shows correct component info

### Phase 5 — Multi-Select
- Add action bar component below panel header
- Implement "All N Matching" (selects all `equivalentNodes`)
- Implement "+ Different Element" (re-enters selection mode, appends to selection)
- Handle mixed selection: disable Design tab, keep Message tab active
- Implement "Pick Specific…" instance picker popover
- Enhance `ELEMENT_SELECTED` with `instances` metadata
- **Verification:** Can select all matching, pick specific, add different elements; Design tab correctly disables for mixed selections

---

## Edge Cases

| Case | Behavior |
|---|---|
| Element removed from DOM during selection mode | Cancel selection mode, show toast "Element no longer available" |
| Component has 100+ instances | Instance picker shows first 20 with "Show more…" button |
| User presses ⌘⇧C when panel is closed | Open panel first, then activate selection mode |
| User presses Esc when not in selection mode | No-op |
| Mixed selection then user removes the non-matching element | Re-enable Design tab automatically |
| Page navigates during selection mode | Cancel selection mode, clear selection |

---

## Decisions & Rationale

| Decision | Rationale |
|---|---|
| AI glow on toggle (not just icon swap) | Users expect AI tools to signal their AI nature visually; the glow is now a universal pattern |
| Selection mode auto-deactivates after click | Matches Chrome DevTools behavior; prevents accidental multi-clicks |
| `⌘⇧C` keyboard shortcut | Exact same shortcut as Chrome DevTools inspect element — muscle memory for developers |
| Design tab disabled for mixed selections | Tailwind class scrubbing only works on elements with the same class structure |
| Action bar over context menu | More discoverable than right-click or hidden menus; all options visible at a glance |
| Hover preview is outline-only (no box model) | Keeps it fast and non-intrusive; box model is shown after actual selection |

---

## Future Enhancements (Out of Scope)

- **Shift+click multi-select** — hold Shift while clicking to add to selection without re-entering selection mode
- **Drag-to-select** — draw a selection rectangle to select multiple elements at once
- **Component tree browser** — sidebar showing React component hierarchy for navigation
- **Pin selections** — save element selections for quick recall
- **Selection history** — back/forward navigation between previous selections
