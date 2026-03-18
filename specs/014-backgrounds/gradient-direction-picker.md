# Gradient Direction Picker — Implementation Plan

Implements the interactive `gradient-bar-stops.html` prototype as a real React component inside the panel. The single control handles **both** gradient editing (direction + draggable color stops) and **solid background color** selection, toggled via the center ● cell of the direction picker.

**Reference:** `specs/014-backgrounds/gradient-bar-stops.html` (interactive prototype), `specs/014-backgrounds/backgrounds-editor.html` (static states ①–⑧)

---

## Milestones

| # | Milestone | Ship gate |
|---|-----------|-----------|
| M1 | Parser recognizes gradient + bg utility classes | Unit tests pass |
| M2 | `DirectionPicker` component (direction grid + solid toggle) | Storybook + unit tests |
| M3 | `GradientBar` component (gradient track + pentagon handles) | Storybook + unit tests |
| M4 | `GradientEditor` compound component (assembles M2 + M3 + ColorGrid) | Storybook stories for all 8 states |
| M5 | Picker integration (Gradient detected → render `GradientEditor`) | Manual E2E: select gradient element, edit direction, drag stop |
| M6 | Solid color mode (center ● → solid swatch + ColorGrid) | Manual E2E: toggle to solid, pick color, toggle back to gradient |

---

## M1 — Parser: Recognize gradient + bg utility classes

### Files changed

- `overlay/src/class-parser.ts`

### Changes

**1. Add `'gradient'` to the category union:**

```ts
// Before
category: 'spacing' | 'sizing' | 'typography' | 'color' | 'borders' | 'effects' | 'layout' | 'flexbox';

// After
category: 'spacing' | 'sizing' | 'typography' | 'color' | 'borders' | 'effects' | 'layout' | 'flexbox' | 'gradient';
```

**2. Add gradient exact matches to `EXACT_MATCH_MAP`:**

```ts
// Gradient directions
'bg-gradient-to-t':  { category: 'gradient', themeKey: null },
'bg-gradient-to-tr': { category: 'gradient', themeKey: null },
'bg-gradient-to-r':  { category: 'gradient', themeKey: null },
'bg-gradient-to-br': { category: 'gradient', themeKey: null },
'bg-gradient-to-b':  { category: 'gradient', themeKey: null },
'bg-gradient-to-bl': { category: 'gradient', themeKey: null },
'bg-gradient-to-l':  { category: 'gradient', themeKey: null },
'bg-gradient-to-tl': { category: 'gradient', themeKey: null },
```

These get matched before prefix matching, so `bg-gradient-to-r` will no longer fall through to the `bg-` → color path.

**3. Add `from-`, `via-`, `to-` to `PREFIX_MAP`:**

```ts
// Gradient stops — MUST come before shorter prefixes in sorted list
{ prefix: 'from-', category: 'gradient', themeKey: 'colors' },
{ prefix: 'via-',  category: 'gradient', themeKey: 'colors' },
{ prefix: 'to-',   category: 'gradient', themeKey: 'colors' },
```

**4. Add gradient stop disambiguation function `parseGradientStopClass()`:**

The `from-`, `via-`, `to-` prefixes can hold either a color (`from-blue-500`) or a position percent (`from-10%`). Need disambiguation:

```ts
function parseGradientStopClass(prefix: 'from-' | 'via-' | 'to-', value: string): ParsedClass {
  // Position if value matches \d+%
  if (/^\d+%$/.test(value)) {
    return {
      category: 'gradient',
      valueType: 'scalar',
      prefix,
      value,
      fullClass: `${prefix}${value}`,
      themeKey: null,  // not a theme scale — 0-100% in 5% steps
    };
  }
  // Otherwise it's a color
  return {
    category: 'gradient',
    valueType: 'color',
    prefix,
    value,
    fullClass: `${prefix}${value}`,
    themeKey: 'colors',
  };
}
```

Wire this into the `parseClasses()` loop by checking `cls.startsWith('from-')`, `cls.startsWith('via-')`, `cls.startsWith('to-')` **before** the generic PREFIX_MAP scan, similar to the `text-` and `border-` disambiguation blocks.

**5. Disambiguate `bg-` for non-color values:**

Add a `parseBgClass()` function (similar to `parseTextClass()` and `parseBorderClass()`):

```ts
const BG_POSITION_KEYWORDS = new Set([
  'center', 'top', 'bottom', 'left', 'right',
  'left-top', 'left-bottom', 'right-top', 'right-bottom',
]);
const BG_SIZE_KEYWORDS = new Set(['auto', 'cover', 'contain']);
const BG_ATTACHMENT_KEYWORDS = new Set(['fixed', 'local', 'scroll']);
const BG_REPEAT_KEYWORDS = new Set([
  'repeat', 'no-repeat', 'repeat-x', 'repeat-y',
  'repeat-round', 'repeat-space',
]);

function parseBgClass(value: string): ParsedClass {
  const fullClass = `bg-${value}`;
  if (BG_POSITION_KEYWORDS.has(value))   return { category: 'color', valueType: 'enum', prefix: 'bg-', value, fullClass, themeKey: null };
  if (BG_SIZE_KEYWORDS.has(value))       return { category: 'color', valueType: 'enum', prefix: 'bg-', value, fullClass, themeKey: null };
  if (BG_ATTACHMENT_KEYWORDS.has(value))  return { category: 'color', valueType: 'enum', prefix: 'bg-', value, fullClass, themeKey: null };
  if (BG_REPEAT_KEYWORDS.has(value))     return { category: 'color', valueType: 'enum', prefix: 'bg-', value, fullClass, themeKey: null };
  // Default: color
  return { category: 'color', valueType: 'color', prefix: 'bg-', value, fullClass, themeKey: 'colors' };
}
```

Keep `bg-center`, `bg-cover`, etc. in category `'color'` (the "Backgrounds" section) so they render alongside the gradient editor — just with `valueType: 'enum'` so they show as static chips, not color pickers.

**6. Update `parseClasses()` to route bg- and gradient classes:**

In the main loop, add early-exit branches (order matters):

```ts
// 1. Exact match (already exists) — catches bg-gradient-to-*
// 2. Gradient stop disambiguate
if (cls.startsWith('from-')) { results.push(parseGradientStopClass('from-', cls.slice(5))); continue; }
if (cls.startsWith('via-'))  { results.push(parseGradientStopClass('via-',  cls.slice(4))); continue; }
if (cls.startsWith('to-'))   { results.push(parseGradientStopClass('to-',   cls.slice(3))); continue; }
// 3. bg- disambiguate (before PREFIX_MAP catches it as color)
if (cls.startsWith('bg-')) { results.push(parseBgClass(cls.slice(3))); continue; }
```

### Tests

Add test cases to `overlay/src/class-parser.test.ts` (or create if needed):

```
parseClasses('bg-gradient-to-r from-blue-500 via-white from-10% to-pink-500 to-90%')
→ [
    { category: 'gradient', valueType: 'enum',   prefix: 'bg-gradient-to-r', value: '', fullClass: 'bg-gradient-to-r' },
    { category: 'gradient', valueType: 'color',  prefix: 'from-', value: 'blue-500', fullClass: 'from-blue-500' },
    { category: 'gradient', valueType: 'color',  prefix: 'via-',  value: 'white',    fullClass: 'via-white' },
    { category: 'gradient', valueType: 'scalar', prefix: 'from-', value: '10%',      fullClass: 'from-10%' },
    { category: 'gradient', valueType: 'color',  prefix: 'to-',   value: 'pink-500', fullClass: 'to-pink-500' },
    { category: 'gradient', valueType: 'scalar', prefix: 'to-',   value: '90%',      fullClass: 'to-90%' },
  ]

parseClasses('bg-blue-500')     → [{ category: 'color', valueType: 'color' }]
parseClasses('bg-center')       → [{ category: 'color', valueType: 'enum' }]
parseClasses('bg-cover')        → [{ category: 'color', valueType: 'enum' }]
parseClasses('bg-no-repeat')    → [{ category: 'color', valueType: 'enum' }]
```

---

## M2 — DirectionPicker component

### Files created (modlet pattern)

```
panel/src/components/DirectionPicker/
  index.ts
  DirectionPicker.tsx
  DirectionPicker.test.tsx
  DirectionPicker.stories.tsx
  types.ts
```

### types.ts

```ts
export type GradientDirection = 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l' | 'tl';
export type BackgroundMode = 'gradient' | 'solid';

export interface DirectionPickerProps {
  /** Current gradient direction short name, e.g. 'r' */
  direction: GradientDirection;
  /** 'gradient' (direction arrows active) or 'solid' (center ● active) */
  mode: BackgroundMode;
  /** Fired on hover for live preview. Null when hovering center cell. */
  onHover: (dir: GradientDirection | null) => void;
  /** Fired when mouse leaves the grid */
  onLeave: () => void;
  /** Fired on direction click — switches to gradient mode */
  onDirectionClick: (dir: GradientDirection) => void;
  /** Fired when center ● is clicked — switches to solid mode */
  onSolidClick: () => void;
}
```

### DirectionPicker.tsx

A 3×3 CSS grid of 20×20px cells. Each cell is a `<button>`:

- **8 arrows** (`↖ ↑ ↗ ← → ↙ ↓ ↘`) — each has `data-dir` corresponding to a `GradientDirection`
- **Center cell** — the ● solid-color toggle

**Visual states:**
- `mode === 'gradient'`: active direction gets teal fill, center ● is muted
- `mode === 'solid'`: center ● gets orange fill, all arrows dim to 35% opacity (but still hoverable — hovering an arrow previews gradient direction)

**Below the grid:** a text label showing `to-{dir}` (gradient) or `bg-{colorName}` (solid) — the parent passes this text in, or the component emits it.

**Interaction:**
- Hover arrow → `onHover(dir)` — parent sends `PATCH_PREVIEW` with `bg-gradient-to-{dir}`
- Leave grid → `onLeave()` — parent reverts preview
- Click arrow → `onDirectionClick(dir)` — parent commits `bg-gradient-to-{dir}`, mode → gradient
- Click center ● → `onSolidClick()` — parent switches to solid mode

### Stories

- Default (gradient mode, direction `r`)
- Diagonal direction (`br`)
- Solid mode active (center ● highlighted, arrows dimmed)

---

## M3 — GradientBar component

### Files created (modlet pattern)

```
panel/src/components/GradientBar/
  index.ts
  GradientBar.tsx
  GradientBar.test.tsx
  GradientBar.stories.tsx
  types.ts
```

### types.ts

```ts
export interface GradientStop {
  id: string;
  /** 'from' | 'via' | 'to' */
  role: 'from' | 'via' | 'to';
  /** Tailwind color name, e.g. 'blue-500' */
  colorName: string;
  /** Resolved hex for rendering, e.g. '#3B82F6' */
  hex: string;
  /** 0–100, null if no position class exists */
  position: number | null;
}

export interface GradientBarProps {
  stops: GradientStop[];
  direction: string;       // CSS direction string, e.g. 'to right'
  /** Called when user drags a handle to a new position */
  onStopDrag: (stopId: string, newPosition: number) => void;
  /** Called when user clicks a handle (to open color picker) */
  onStopClick: (stopId: string) => void;
  /** Called when user clicks the bar to insert a new via stop */
  onBarClick: (position: number) => void;
  /** Called when user clicks × to remove a via stop */
  onStopRemove: (stopId: string) => void;
  /** ID of currently selected stop (has teal stroke) */
  selectedStopId: string | null;
}
```

### GradientBar.tsx

**Structure:**
```
<div className="grad-area" style={{ paddingTop: 28, position: 'relative' }}>
  {stops.map(stop => <StopHandle key={stop.id} ... />)}
  <div className="grad-track" style={{ background: computedGradient }} />
</div>
```

**Pentagon handle:** SVG `<path d="M2 1 L20 1 L20 16 L11 25 L2 16 Z">` filled with the stop's hex color. White stroke normally, teal stroke when selected.

**Drag behavior:** `onMouseDown` → track `mousemove` on `document` → compute new position as `((clientX - trackLeft) / trackWidth) * 100`, snap to 5% increments → call `onStopDrag(id, snapped)`. Suppress click after drag.

**click-to-add:** `gradTrack.onClick` → compute position, snap to 5%, call `onBarClick(position)`.

**Remove button:** Small orange circle (×) on hover of via handles. Not shown on from/to endpoints.

**CSS gradient computation:**

```ts
function buildGradientCSS(stops: GradientStop[], direction: string): string {
  const sorted = [...stops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const colorStops = sorted.map(s => s.position != null ? `${s.hex} ${s.position}%` : s.hex);
  return `linear-gradient(${direction}, ${colorStops.join(', ')})`;
}
```

### Stories

- 2 stops (from + to, no positions)
- 3 stops with positions (from 5%, via 50%, to 95%)
- Selected handle (teal stroke on from)
- Single stop (degenerate — just renders bar)

---

## M4 — GradientEditor compound component

### Files created (modlet pattern)

```
panel/src/components/GradientEditor/
  index.ts
  GradientEditor.tsx
  GradientEditor.test.tsx
  GradientEditor.stories.tsx
  types.ts
  useGradientState.ts
```

### types.ts

```ts
import type { ParsedClass } from '../../../../overlay/src/class-parser';

export interface GradientEditorProps {
  /** All gradient-category ParsedClasses from the selected element */
  gradientClasses: ParsedClass[];
  /** All bg- color classes (for solid mode initial color) */
  bgColorClasses: ParsedClass[];
  /** Tailwind config (for color palette) */
  tailwindConfig: any;
  /** Preview a class swap (same as Picker uses) */
  onPreview: (oldClass: string, newClass: string) => void;
  /** Revert active preview */
  onRevert: () => void;
  /** Stage a change */
  onStage: (property: string, oldClass: string, newClass: string) => void;
}
```

### useGradientState.ts — Local state hook

Parses the `gradientClasses` and `bgColorClasses` into a working state:

```ts
interface GradientState {
  mode: 'gradient' | 'solid';
  direction: GradientDirection;      // 'r', 'b', 'tl', etc.
  stops: GradientStop[];             // from, via(s), to
  solidColor: { name: string; hex: string } | null;
  selectedStopId: string | null;
  colorPickerOpen: boolean;
}
```

**Initialization logic:**
- If `gradientClasses` contains a `bg-gradient-to-*` → mode `'gradient'`, parse direction
- Collect `from-{color}`, `via-{color}`, `to-{color}` into stops
- Match `from-{n}%`, `via-{n}%`, `to-{n}%` to corresponding stops as positions
- If no gradient classes but `bgColorClasses` has a `bg-{color}` → mode `'solid'`
- If no bg classes at all → mode `'solid'` with solidColor null (empty state)

**Color resolution:** Uses `tailwindConfig.colors` to resolve `'blue-500'` → `'#3B82F6'`. Follow the existing pattern from `ColorGrid`.

### GradientEditor.tsx — Layout

```
┌─────────────────────────────────────────┐
│  [DirectionPicker]  [GradientBar ─────] │  ← combo-row (flex, gap-10)
│   to-r                                  │
│                                         │
│  (or in solid mode:)                    │
│  [DirectionPicker]  [solid swatch ────] │
│   bg-blue-500                           │
├─────────────────────────────────────────┤
│  [ColorGrid — shown when a stop or      │  ← inline, below the combo row
│   solid swatch is clicked]              │
├─────────────────────────────────────────┤
│  hint text                              │
└─────────────────────────────────────────┘
```

**Key interactions wired:**

| User action | GradientEditor response |
|---|---|
| Hover direction arrow | `onPreview(currentDirClass, 'bg-gradient-to-{dir}')` |
| Leave direction grid | `onRevert()` |
| Click direction arrow | `onStage('bg-gradient-to-', currentDirClass, 'bg-gradient-to-{dir}')`, mode → gradient |
| Click center ● | Set mode → solid, close color picker |
| Click stop handle | Open ColorGrid inline for that stop's prefix |
| Hover color in grid | `onPreview(stop.fullClass, '{prefix}-{color}')` |
| Click color in grid | `onStage(prefix, stop.fullClass, '{prefix}-{color}')`, close picker |
| Drag stop handle | `onPreview(stop.positionClass, '{prefix}-{newPct}%')` on move; `onStage(...)` on release |
| Click gradient bar | Insert new via stop — `onStage('via-', '', 'via-{color}')` (add) |
| Click × on via handle | `onStage('via-', viaColorClass, '')` (remove) and also `onStage('via-', viaPosClass, '')` if position exists |
| Click solid swatch | Open ColorGrid for `bg-` prefix |
| Hover color in solid grid | `onPreview(currentBgClass, 'bg-{color}')` |
| Click color in solid grid | `onStage('bg-', currentBgClass, 'bg-{color}')` |

### Stories

Match the 8 states from `backgrounds-editor.html`:

1. **3-stop gradient with positions** — from-indigo-500 from-5% via-purple-500 via-50% to-pink-500 to-95%
2. **2-stop gradient, no positions** — from-blue-500 to-pink-500 direction b
3. **Solid color** — bg-blue-500, center ● active
4. **Solid + opacity** — bg-blue-500/75 (opacity scrubber is a future stretch — show the class but don't implement scrubber in M4)
5. **Color grid open** — from-stop selected, ColorGrid visible
6. **Gradient + empty state** — no gradient classes, show hint

---

## M5 — Picker integration

### Files changed

- `panel/src/Picker.tsx`

### Changes

**1. Import GradientEditor:**

```ts
import { GradientEditor } from './components/GradientEditor';
```

**2. Detect gradient classes in the Backgrounds section:**

Inside the `PRIORITY_SECTIONS.map()` block, for `category === 'color'`:

```ts
// Collect gradient classes from the element
const gradientClasses = (groups.get('gradient') || []);
const bgColorClasses = classes.filter(c => c.valueType === 'color');

// If gradient OR bg-color classes exist, render GradientEditor
const showGradientEditor = gradientClasses.length > 0 || bgColorClasses.length > 0;
```

**3. Render GradientEditor before color chips:**

```tsx
<PropertySection key="color" label="Backgrounds" ...>
  {showGradientEditor && (
    <GradientEditor
      gradientClasses={gradientClasses}
      bgColorClasses={bgColorClasses}
      tailwindConfig={tailwindConfig}
      onPreview={handlePreview}
      onRevert={handleRevert}
      onStage={handleStage}
    />
  )}

  {/* Remaining non-gradient bg classes (bg-center, bg-cover, etc.) as enum chips */}
  {classes.filter(c => c.valueType === 'enum').map(cls => (
    <div key={cls.fullClass} className="...enum chip...">{cls.fullClass}</div>
  ))}
</PropertySection>
```

**4. Update PRIORITY_SECTIONS to include gradient:**

The `groupByCategory` separates gradient classes into their own category. We need to pull them out alongside the `color` section, not render them as a separate section:

```ts
// In the color section rendering, also grab gradient classes
const gradientClasses = groups.get('gradient') || [];
```

**5. Update the `+ button` available properties:**

```ts
const BACKGROUNDS_PROPERTIES: AvailableProperty[] = [
  { name: 'Background color', prefixHint: 'bg-{color}',     prefix: 'bg-' },
  { name: 'Gradient',         prefixHint: 'bg-gradient-to-*', prefix: 'bg-gradient-to-' },
];
```

### Test app verification

Add gradient classes to an element in `test-app/src/App.tsx`:

```tsx
<div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
  Gradient test
</div>
```

Manual verification:
- Select element → Backgrounds section shows gradient editor
- Direction compass shows `→` active
- Gradient bar renders indigo → purple → pink
- Pentagon handles at default positions
- Click handle → ColorGrid opens
- Drag handle → position updates
- Click arrow → direction changes with live preview
- Click center ● → switches to solid mode showing `bg-indigo-500`

---

## M6 — Solid color mode

Most of this is included in M4's `GradientEditor`, but this milestone covers the complete flow:

### Interactions

**Entering solid mode:**
1. User clicks center ● in DirectionPicker
2. GradientEditor sets `mode: 'solid'`
3. Gradient bar hides, solid swatch appears (filled with first stop's color, or current bg-color)
4. Direction arrows dim (35% opacity)
5. Label changes to `bg-{colorName}`

**Color editing in solid mode:**
1. Click the swatch → ColorGrid opens inline
2. Hover a color → `onPreview('bg-blue-500', 'bg-red-500')` — live preview on page
3. Click a color → `onStage('bg-', 'bg-blue-500', 'bg-red-500')` — committed
4. ColorGrid closes, swatch updates

**Exiting solid mode:**
1. Click any direction arrow → mode → gradient
2. If element had gradient classes before, restore them
3. If element only had `bg-{color}`, stage `bg-gradient-to-r` + `from-{color}` + `to-{color}` as new classes

**Edge: switching gradient → solid should remove gradient classes:**
- Stage removal of `bg-gradient-to-*`, `from-*`, `via-*`, `to-*`
- Stage addition of `bg-{firstStopColor}`

This is complex multi-class staging. The simplest approach: stage each class removal/addition as separate patches via existing `onStage`, and let the patch pipeline handle them.

---

## Implementation order

```
M1  Parser changes + tests                          ~2 hours
M2  DirectionPicker component + stories              ~2 hours
M3  GradientBar component + stories                  ~3 hours
M4  GradientEditor compound + useGradientState       ~4 hours
M5  Picker integration + test app verification       ~2 hours
M6  Solid mode full flow                             ~2 hours
                                                    ─────────
                                           Total:   ~15 hours
```

Each milestone is independently testable. M1–M3 can be developed in parallel by different agents. M4 depends on M2 + M3. M5 depends on M1 + M4. M6 is an extension of M4/M5.

---

## Out of scope (future work)

- **Opacity scrubber** (`bg-blue-500/75`) — noted in spec Phase 1A, separate ticket
- **Position grid** (`bg-center`) — spec Phase 1C, separate component
- **bg-size / bg-repeat / bg-attachment chips** — spec Phase 2, enum chip rendering
- **Radial / conic gradients** — spec Phase 2D
- **Multiple via stops** — the prototype supports N via stops, but the parser/patcher needs careful handling for add/remove of classes that aren't 1:1 replacements
