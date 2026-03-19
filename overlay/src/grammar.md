# Tailwind Grammar Layer

`grammar.ts` is a pure parsing layer that turns a Tailwind class string into structured tokens. It has no side effects, no DOM access, and no rendering awareness — just data in, data out.

---

## Conceptual Framework

Every Tailwind class maps to four concepts:

| Concept | Example | What it means |
|---------|---------|---------------|
| **Section** | `spacing` | Docs-level grouping — what nav section it lives under |
| **Property** | `p` | The CSS property being controlled — what a UI component renders a control for |
| **Side** | `y` | Directional modifier — which axis or face the property applies to |
| **Value** | `2` | The scale step or keyword being applied |

`py-2` deconstructs as: section=`spacing`, property=`p`, side=`y`, value (scale)=`2`.

`inline-block` deconstructs as: section=`layout`, property=`display`, value=`inline-block` (no side).

`border-t-4` deconstructs as: section=`borders`, property=`border`, side=`t`, value (scale)=`4`.

---

## Output: `ParsedToken`

```ts
interface ParsedToken {
  property: string;     // canonical property, e.g. 'p', 'border', 'display'
  fullClass: string;    // original class string, e.g. 'py-2'
  section?: string;     // docs section, e.g. 'spacing', 'layout', 'borders'
  side?: string;        // directional modifier: 't' | 'r' | 'b' | 'l' | 'x' | 'y' | 's' | 'e' | 'bs' | 'be'
  corner?: string;      // corner modifier: 'tl' | 'tr' | 'br' | 'bl'
  scale?: string;       // scale value, e.g. '4', 'full', 'px'
  scaleName?: string;    // which theme scale the value comes from, e.g. 'spacing', 'borderRadius'
  style?: string;       // border/outline style keyword, e.g. 'solid', 'dashed'
  color?: string;       // color token, e.g. 'red-500', 'white'
  align?: string;       // text-align keyword, e.g. 'center', 'left'
  size?: string;        // named size keyword, e.g. 'sm', 'lg' (font-size, shadow)
  value?: string;       // generic enum value (display, position, flex keywords)
  unknown?: true;       // property matched but suffix unrecognized
}
```

**Which field holds the value depends on its semantic kind:**

| Kind | Field | Example |
|------|-------|---------|
| Scale step / theme value | `scale` + `scaleName` | `py-2` → `scale: '2', scaleName: 'spacing'` |
| Color token | `color` | `bg-red-500` → `color: 'red-500'` |
| Style keyword | `style` | `border-dashed` → `style: 'dashed'` |
| Named size (font-size, shadow) | `size` | `text-sm` → `size: 'sm'` |
| Text alignment | `align` | `text-center` → `align: 'center'` |
| Enum value (display, position, flex) | `value` | `flex` → `value: 'flex'` |

---

## Combinators (Segment functions)

A `Segment` is `(suffix: string) => SegmentResult | null`. Each combinator returns a factory:

| Combinator | Matches | Stores |
|------------|---------|--------|
| `nothing()` | empty string only | nothing |
| `keyword('k', ['a','b'])` | one of the listed strings | `{ k: matchedValue }` |
| `scale('scaleName')` | any non-empty string | `{ scale: value, scaleName }` |
| `color()` | any non-empty string | `{ color: value }` |
| `withSide(inner)` | optional side prefix then delegates | `{ side, ...inner.props }` |
| `withCorner(inner)` | optional corner prefix then delegates | `{ corner, ...inner.props }` |
| `oneOf(a, b, c)` | tries each in order, first match wins | whatever matched |
| `custom(fn)` | escape hatch for arbitrary logic | whatever fn returns |

> **Ordering matters in `oneOf`.** Put `keyword()` before `scale()` before `color()` — each is more greedy than the last. `color()` accepts anything non-empty, so it must be last.

---

## Parser Declaration Helpers

### `makeParser(prefix, segment)`

Registers a single prefix → segment mapping.

```ts
makeParser('gap', scale('spacing'))
// 'gap-4' → { property: 'gap', scale: '4', scaleName: 'spacing' }
```

### `sideParser(base, inner, sides?)`

Generates one parser per side variant plus a bare base parser. All side variants carry `canonical: base` so they output `property: base`.

```ts
sideParser('p', scale('spacing'), SIDES_WITH_LOGICAL)
// 'p-4'  → { property: 'p', scale: '4', scaleName: 'spacing' }
// 'py-2' → { property: 'p', side: 'y', scale: '2', scaleName: 'spacing' }
// 'ps-1' → { property: 'p', side: 's', scale: '1', scaleName: 'spacing' }
```

### `cornerParser(base, inner)`

Generates parsers for all corner + side variants, plus a bare base. All canonicalize to `property: base`.

```ts
cornerParser('rounded', scale('borderRadius'))
// 'rounded'       → { property: 'rounded' }
// 'rounded-lg'    → { property: 'rounded', scale: 'lg' }
// 'rounded-t-lg'  → { property: 'rounded', side: 't', scale: 'lg' }
// 'rounded-tl-lg' → { property: 'rounded', corner: 'tl', scale: 'lg' }
```

### `enumParser(property, values)`

Maps a set of full class names to a shared property. Bypasses prefix/suffix logic entirely — each class is compared against the set as a whole string.

```ts
enumParser('display', ['block', 'inline-block', 'flex', 'grid', 'hidden', ...])
// 'block'        → { property: 'display', value: 'block' }
// 'inline-block' → { property: 'display', value: 'inline-block' }
// 'flex'         → { property: 'display', value: 'flex' }
```

### `withSection(section, parsers)`

Stamps a `section` string onto an array of parsers. Use this to wrap each `TAILWIND_PARSERS` group.

```ts
withSection('spacing', [
  ...sideParser('m', scale('spacing'), SIDES_WITH_LOGICAL),
  ...sideParser('p', scale('spacing'), SIDES_WITH_LOGICAL),
  makeParser('gap', scale('spacing')),
])
```

---

## Parsing Functions

### `parseToken(cls, parsers)`

Finds the first parser whose prefix matches `cls`, runs its segment, returns a `ParsedToken` or `null`.

**Matching rules:**
1. If the parser has a `matches` function (enum parsers): call `matches(cls)`, skip if null
2. Else if `cls === prefix`: segment receives `''`
3. Else if `cls.startsWith(prefix + '-')`: segment receives the suffix after the dash
4. Else: skip
5. If segment returns null after a prefix match: return `{ property, fullClass, unknown: true }`

### `parseTokens(classString, parsers)`

Splits on whitespace and calls `parseToken` on each. Skips nulls (unrecognized classes).

---

## Worked Examples

```ts
parseToken('py-2', TAILWIND_PARSERS)
// → { property: 'p', fullClass: 'py-2', section: 'spacing',
//     side: 'y', scale: '2', scaleName: 'spacing' }

parseToken('border-t-4', TAILWIND_PARSERS)
// → { property: 'border', fullClass: 'border-t-4', section: 'borders',
//     side: 't', scale: '4', scaleName: 'borderWidth' }

parseToken('inline-block', TAILWIND_PARSERS)
// → { property: 'display', fullClass: 'inline-block', section: 'layout',
//     value: 'inline-block' }

parseToken('flex', TAILWIND_PARSERS)
// → { property: 'display', fullClass: 'flex', section: 'layout',
//     value: 'flex' }

parseToken('rounded-tl-lg', TAILWIND_PARSERS)
// → { property: 'rounded', fullClass: 'rounded-tl-lg', section: 'borders',
//     corner: 'tl', scale: 'lg', scaleName: 'borderRadius' }

parseToken('bg-red-500', TAILWIND_PARSERS)
// → { property: 'bg', fullClass: 'bg-red-500', section: 'color',
//     color: 'red-500' }

parseToken('unknownclass', TAILWIND_PARSERS)
// → null
```

---

## Registry Sections (`TAILWIND_PARSERS`)

The full registry is organized by section, matching the Tailwind docs nav:

| Section | Key parsers |
|---------|-------------|
| `spacing` | `m`, `p`, `gap`, `space-x`, `space-y` (all with side variants) |
| `sizing` | `w`, `h`, `min-w`, `max-w`, `min-h`, `max-h`, `size` |
| `typography` | `font`, `text`, `leading`, `tracking`, decoration utilities |
| `color` | `bg`, `from`, `via`, `to`, `ring`, `fill`, `stroke` |
| `borders` | `border` (sides + style + color), `rounded` (corners) |
| `effects` | `opacity`, `shadow` |
| `layout` | `display` (enum), `position` (enum), `inset`, `top/right/bottom/left`, `z` |
| `flexbox` | `flex-*`, `grow`, `shrink`, `justify`, `items`, `content`, `self`, `basis`, `grid-*` |
| `overflow` | `overflow`, `overflow-x`, `overflow-y` |
