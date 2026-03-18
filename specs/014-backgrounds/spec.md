# Backgrounds Editor — Requirements

## Overview

A visual background editor for fine-tuning Tailwind background classes on a selected element. The primary use case is **play** — the user already has background classes applied (via code or a previous AI pass) and wants to interactively scrub colors, shift gradient direction, tweak color stops, or reposition a background image, all with live preview on the page.

See companion HTML prototypes:
- `backgrounds-editor.html` — Full backgrounds section with gradient bar, direction picker, and color stop editing
- `gradient-direction-picker.html` — Standalone interactive gradient direction + stop position control

---

## Design Philosophy

1. **Play, not build** — Assume classes already exist. The UI reads what's on the element and lets the user fine-tune it. Adding entirely new properties (via `+`) is secondary.
2. **Live preview always** — Every hover/scrub sends `CLASS_PREVIEW` to the overlay so the user sees the result on the real page in real time.
3. **Gradient is visual** — A gradient bar renders the actual assembled gradient. Users see what they're editing, not just class names.
4. **Compound classes, single control** — A Tailwind gradient is 2–4 classes working together (`bg-gradient-to-r from-blue-500 via-white to-pink-500`). The UI groups these into one visual "gradient editor" rather than treating each class as independent.

---

## Current State & Gaps

The parser currently maps all `bg-*` classes to `{ category: 'color', valueType: 'color' }`. This works for `bg-blue-500` but breaks for:

| Class | Current behavior | Needed |
|-------|-----------------|--------|
| `bg-gradient-to-r` | Parsed as color `gradient-to-r` — mismatch | New category: `gradient`, valueType: `enum` |
| `from-blue-500` | **Dropped** — `from-` not in PREFIX_MAP | New prefix, category: `gradient`, valueType: `color` |
| `via-white` | **Dropped** | Same |
| `to-pink-500` | **Dropped** | Same |
| `from-10%` | **Dropped** | New prefix, category: `gradient`, valueType: `scalar` |
| `bg-center` | Parsed as color `center` — mismatch | New category: `background`, valueType: `enum` |
| `bg-cover` | Parsed as color `cover` — mismatch | New category: `background`, valueType: `enum` |
| `bg-no-repeat` | **Dropped** | New category: `background`, valueType: `enum` |
| `bg-fixed` | Parsed as color `fixed` — mismatch | New category: `background`, valueType: `enum` |

### Parser changes needed

1. **Disambiguate `bg-`** — Similar to how `text-` is already disambiguated (size vs color vs align), `bg-` needs to determine: color vs gradient-direction vs position vs size vs attachment
2. **Add `from-`, `via-`, `to-` prefixes** — Map to gradient category
3. **Group gradient classes** — The panel needs to know these 2–4 classes form a single gradient and should render as one compound editor

---

## Phase 1 — Ship Now

### 1A: Solid Background Color (improve existing)

Already partially works. Improvements:

- **Opacity scrubbing** — If `bg-blue-500/75` is present, show an opacity scrubber (0–100) alongside the color swatch. Hovering a value previews `bg-blue-500/{n}` live.
- **Color swatch chip** — Shows current color with a swatch box + class name. Clicking opens ColorGrid (already works).

### 1B: Gradient Editor

The signature feature of this spec. When the selected element has gradient classes, the Backgrounds section renders a **gradient editor** grouping all related classes into one visual control.

#### Gradient bar (interactive preview)

A horizontal bar (full section width, ~28px tall, rounded) rendering the actual CSS gradient assembled from the element's classes:

```
┌──────────────────────────────────────────────────────────┐
│  ← blue-500 ─────── via white ─────── pink-500 →        │
│  (actual gradient rendered as CSS background)            │
│       ▲ 10%              ▲ 40%              ▲ 90%       │
└──────────────────────────────────────────────────────────┘
```

- Assembled from `from-{color}`, `via-{color}`, `to-{color}` values + `bg-gradient-to-{dir}`
- Stop position percentages (`from-10%`, `via-40%`, `to-90%`) control where each color lands
- When positions are set, small **handle markers** appear on the bar at the corresponding percentage
- Updates live as the user edits any stop, position, or direction

#### Direction picker

An 8-direction compass widget for `bg-gradient-to-{dir}`:

```
        tl    t    tr
          ╲   │   ╱
     l  ── ● ── →  r      (current: r)
          ╱   │   ╲
        bl    b    br
```

- 8 clickable direction nodes arranged in a circle/grid
- The current direction is highlighted (teal fill)
- **Hover** a direction → `CLASS_PREVIEW` with `bg-gradient-to-{dir}` → gradient bar + page update live
- **Click** a direction → `CLASS_COMMIT` (locks the value)
- Compact: fits in ~64×64px

#### Color stop chips

Below the gradient bar, each stop renders as a color swatch chip paired with an optional position scrubber:

```
  ┌──────────────────────────────┐
  │ ■  from blue-500    ◂ 10% ▸ │
  ├──────────────────────────────┤
  │ ■  via  white       ◂ 40% ▸ │
  ├──────────────────────────────┤
  │ ■  to   pink-500    ◂ 90% ▸ │
  └──────────────────────────────┘
```

- Each stop has two parts: a **color swatch** (left) and a **position scrubber** (right)
- **Color swatch**: shows the stop prefix + color name. Click to open ColorGrid below.
- **Position scrubber**: shows the `{n}%` value if a stop position class exists (e.g. `from-10%`). ScaleScrubber with 0–100 in 5% increments.
  - If no position class exists, shows a ghost `%` placeholder — clicking/scrubbing adds `{prefix}{n}%`
  - **Hover** a scrubber value → `CLASS_PREVIEW` with `{prefix}{n}%` → gradient bar handle moves + page updates live
  - **Click / release scrub** → `CLASS_COMMIT`
  - **×** on the position chip removes just the position (reverts to default auto-spacing)
- **×** button on `via-` chip removes the entire via stop (both color and position classes)

#### Adding a `via-` stop

If the gradient has `from-` and `to-` but no `via-`:
- A ghost chip with dashed border labeled `+ via` appears between the from and to chips
- Clicking it opens the ColorGrid scoped to `via-`
- Picking a color adds the `via-{color}` class
- After a via color is set, the position `%` scrubber appears alongside it

### 1C: Background Position Picker

When `bg-center`, `bg-top`, `bg-right-top`, etc. is present, render a **3×3 position grid**:

```
  ┌───┬───┬───┐
  │ ╲ │ ↑ │ ╱ │
  ├───┼───┼───┤
  │ ← │ ● │ → │    (current: center)
  ├───┼───┼───┤
  │ ╱ │ ↓ │ ╲ │
  └───┴───┴───┘
```

- 9 cells: `left-top`, `top`, `right-top`, `left`, `center`, `right`, `left-bottom`, `bottom`, `right-bottom`
- Current position highlighted (teal fill)
- **Hover** → `CLASS_PREVIEW` with `bg-{position}`
- **Click** → `CLASS_COMMIT`
- Compact: ~52×52px inline control

---

## Phase 2 — Later

### 2A: Background Size

`bg-cover`, `bg-contain`, `bg-auto` — simple enum dropdown. Low priority because it's only 3 values and not very "scrubbable."

### 2B: Background Repeat

`bg-repeat`, `bg-no-repeat`, `bg-repeat-x`, `bg-repeat-y`, `bg-repeat-round`, `bg-repeat-space` — enum dropdown or icon toggles.

### 2C: Background Attachment

`bg-fixed`, `bg-local`, `bg-scroll` — enum dropdown. Rarely changed.

### 2D: Radial & Conic Gradients

Tailwind v4 supports `bg-radial-*` and `bg-conic-*`. These need entirely different visualizations (radial picker, angle wheel). Defer until the linear gradient editor is solid.

### 2E: Multiple Backgrounds / Layers

CSS supports multiple backgrounds. Tailwind doesn't natively expose this, so it's extremely low priority.

---

## Data Model

### New `ParsedClass` categories

```ts
// Gradient-related classes
{ prefix: 'bg-gradient-to-', category: 'gradient',   valueType: 'enum',   themeKey: null }
{ prefix: 'from-',           category: 'gradient',   valueType: 'color',  themeKey: 'colors' }
{ prefix: 'via-',            category: 'gradient',   valueType: 'color',  themeKey: 'colors' }
{ prefix: 'to-',             category: 'gradient',   valueType: 'color',  themeKey: 'colors' }

// Background utility classes (disambiguated from bg-{color})
{ prefix: 'bg-',  category: 'background', valueType: 'enum', themeKey: null }
// When value ∈ {center, top, bottom, left, right, left-top, left-bottom, right-top, right-bottom}
// → category: 'background', specifically position
// When value ∈ {cover, contain, auto} → category: 'background', specifically size
// When value ∈ {fixed, local, scroll} → category: 'background', specifically attachment
// When value ∈ {repeat, no-repeat, repeat-x, repeat-y, ...} → needs 'bg-' prefix handling
// Otherwise → category: 'color' (original behavior for color names)
```

### Gradient grouping

The panel needs to group gradient classes into a single compound control. Proposed approach:

```ts
interface GradientStop {
  color: ParsedClass | null;       // from-blue-500, via-white, to-pink-500
  position: ParsedClass | null;    // from-10%, via-40%, to-90%  (nullable — auto when absent)
}

interface GradientGroup {
  direction: ParsedClass | null;   // bg-gradient-to-r
  from: GradientStop;              // { color: from-blue-500, position: from-10% }
  via: GradientStop | null;        // { color: via-white, position: via-40% } or null
  to: GradientStop;                // { color: to-pink-500, position: to-90% }
}
```

The Picker (or a new `GradientEditor` component) collects all `category: 'gradient'` classes from the element and assembles them into a `GradientGroup`. This group is rendered as one compound editor, not as individual chips.

---

## Component Architecture

### New components (modlet pattern)

```
panel/src/components/
  GradientEditor/
    index.ts
    GradientEditor.tsx       ← Main compound editor
    GradientEditor.test.tsx
    GradientEditor.stories.tsx
    GradientBar.tsx           ← Renders the CSS gradient preview bar
    DirectionPicker.tsx       ← 8-direction compass widget
    types.ts

  PositionGrid/
    index.ts
    PositionGrid.tsx          ← 3×3 bg-position picker
    PositionGrid.test.tsx
    PositionGrid.stories.tsx
```

### Integration with Picker.tsx

The Backgrounds section in `Picker.tsx` currently renders all `category: 'color'` classes. Changes needed:

1. **Gradient detection** — If the element has any `category: 'gradient'` classes, render a `GradientEditor` above the regular color chips
2. **Position detection** — If the element has a `bg-{position}` class, render a `PositionGrid` 
3. **Remaining `bg-{color}` classes** — Continue rendering as color swatch chips (existing behavior)

### Interaction flow

```
User clicks element with: bg-gradient-to-r from-blue-500 to-pink-500 bg-center

Panel renders:
┌─────────────────────────────────────────────┐
│ ● BACKGROUNDS                           [+] │
│                                             │
│ ┌─ Gradient ─────────────────────────────┐  │
│ │ [====gradient bar (blue→pink)====]     │  │
│ │                                        │  │
│ │  ← direction →     ┌───┬───┬───┐      │  │
│ │  [compass: →r]      │   │   │   │      │  │
│ │                     ├───┼───┼───┤      │  │
│ │                     │   │ ● │   │      │  │
│ │   from    via   to  ├───┼───┼───┤      │  │
│ │  [■ blue] [+via]    │   │   │   │      │  │
│ │           [■ pink]  └───┴───┴───┘      │  │
│ └────────────────────────────────────────┘  │
│                                             │
│ Position: bg-center  [3×3 grid with ●]      │
│─────────────────────────────────────────────│
```

---

## Behavioral Rules

### Gradient bar updates

The gradient bar CSS background is computed from the current state:

```
background: linear-gradient(to {dir}, {fromColor} {fromPos?}, {viaColor?} {viaPos?}, {toColor} {toPos?})
```

Where `{fromPos?}` etc. are the optional percentage positions (e.g. `10%`).

Every preview or commit for any gradient class (color or position) triggers a recompute of this bar. Handle markers on the bar move in sync with position scrubbers.

### Direction picker behavior

| State | Behavior |
|-------|----------|
| Idle | Current direction filled teal, others are muted dots |
| Hover a direction | That dot highlights, `CLASS_PREVIEW` sent, gradient bar + page update |
| Click a direction | `CLASS_COMMIT`, dot stays teal, old direction loses highlight |
| No `bg-gradient-to-*` exists | Direction picker hidden (only shows when gradient is detected) |

### Color stop behavior

| State | Behavior |
|-------|----------|
| Idle | Each stop shows color swatch + optional position scrubber |
| Click a color swatch | ColorGrid opens inline below, scoped to that stop's prefix |
| Hover a color in grid | `CLASS_PREVIEW` with `{prefix}{color}`, gradient bar updates live |
| Click a color in grid | `CLASS_COMMIT`, grid closes, chip updates |
| Click × on `via-` chip | Removes the `via-` color + position classes (gradient becomes 2-stop) |
| Click `+ via` ghost | Opens ColorGrid for `via-` prefix |

### Stop position behavior

| State | Behavior |
|-------|----------|
| No position class | Ghost `%` placeholder next to the color chip |
| Has position (e.g. `from-10%`) | ScaleScrubber showing `10%`, scrubbable 0–100 in 5% steps |
| Scrub / hover a value | `CLASS_PREVIEW` with `{prefix}{n}%`, gradient bar handle moves live |
| Release scrub / click value | `CLASS_COMMIT` |
| Click × on position | Removes just the position class (stop reverts to auto-spacing) |
| Gradient bar handle drag (future) | Same as scrubbing — maps horizontal position to 0–100% |

### Position grid behavior

| State | Behavior |
|-------|----------|
| Idle | Current position cell is teal, others empty |
| Hover a cell | That cell highlights, `CLASS_PREVIEW` with `bg-{position}` |
| Click a cell | `CLASS_COMMIT` |
| No position class exists | Grid hidden, available via `+` menu |

---

## Tailwind Class Reference

### Gradient directions
```
bg-gradient-to-t  bg-gradient-to-tr  bg-gradient-to-r  bg-gradient-to-br
bg-gradient-to-b  bg-gradient-to-bl  bg-gradient-to-l  bg-gradient-to-tl
```

### Gradient color stops
```
from-{color}   via-{color}   to-{color}
from-{n}%      via-{n}%      to-{n}%
```

Stop position scale (5% increments):
```
0%  5%  10%  15%  20%  25%  30%  35%  40%  45%
50%  55%  60%  65%  70%  75%  80%  85%  90%  95%  100%
```

### Background position
```
bg-center  bg-top  bg-right-top  bg-right  bg-right-bottom
bg-bottom  bg-left-bottom  bg-left  bg-left-top
```

### Background size
```
bg-auto  bg-cover  bg-contain
```

### Background repeat
```
bg-repeat  bg-no-repeat  bg-repeat-x  bg-repeat-y
bg-repeat-round  bg-repeat-space
```

### Background attachment
```
bg-fixed  bg-local  bg-scroll
```
