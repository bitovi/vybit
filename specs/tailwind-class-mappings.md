# Tailwind Class → Category Mappings

This document defines how Tailwind utility classes detected on a clicked element are categorized into picker sections. The groupings mirror Tailwind's official documentation structure.

The overlay parses each class on the element, matches it against the prefix patterns below, and groups them into sections in the picker UI. Only classes that match a known prefix are shown as editable — unknown classes are ignored.

---

## Spacing

Classes that control padding, margin, gap, and space between children. All use `theme.spacing` as their scale.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `p-` | `padding` (all) | `spacing` |
| `px-` | `padding-inline` | `spacing` |
| `py-` | `padding-block` | `spacing` |
| `pt-` | `padding-top` | `spacing` |
| `pr-` | `padding-right` | `spacing` |
| `pb-` | `padding-bottom` | `spacing` |
| `pl-` | `padding-left` | `spacing` |
| `ps-` | `padding-inline-start` | `spacing` |
| `pe-` | `padding-inline-end` | `spacing` |
| `m-` | `margin` (all) | `spacing` |
| `mx-` | `margin-inline` | `spacing` |
| `my-` | `margin-block` | `spacing` |
| `mt-` | `margin-top` | `spacing` |
| `mr-` | `margin-right` | `spacing` |
| `mb-` | `margin-bottom` | `spacing` |
| `ml-` | `margin-left` | `spacing` |
| `ms-` | `margin-inline-start` | `spacing` |
| `me-` | `margin-inline-end` | `spacing` |
| `gap-` | `gap` | `spacing` |
| `gap-x-` | `column-gap` | `spacing` |
| `gap-y-` | `row-gap` | `spacing` |
| `space-x-` | margin between horizontal children | `spacing` |
| `space-y-` | margin between vertical children | `spacing` |

---

## Sizing

Classes that control width, height, min/max dimensions.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `w-` | `width` | `spacing` (plus keywords: `auto`, `full`, `screen`, `fit`, `min`, `max`, fractions) |
| `min-w-` | `min-width` | `spacing` + keywords |
| `max-w-` | `max-width` | `spacing` + named breakpoints (`sm`, `md`, `lg`, `xl`, etc.) |
| `h-` | `height` | `spacing` + keywords |
| `min-h-` | `min-height` | `spacing` + keywords |
| `max-h-` | `max-height` | `spacing` + keywords |
| `size-` | `width` + `height` | `spacing` + keywords |

---

## Typography

Classes that control font, text appearance, and line spacing.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`–`text-9xl` | `font-size` + `line-height` | `fontSize` |
| `font-thin`, `font-extralight`, `font-light`, `font-normal`, `font-medium`, `font-semibold`, `font-bold`, `font-extrabold`, `font-black` | `font-weight` | `fontWeight` |
| `font-sans`, `font-serif`, `font-mono` | `font-family` | `fontFamily` |
| `leading-` | `line-height` | `lineHeight` |
| `tracking-` | `letter-spacing` | `letterSpacing` |
| `text-left`, `text-center`, `text-right`, `text-justify`, `text-start`, `text-end` | `text-align` | n/a (keyword) |
| `uppercase`, `lowercase`, `capitalize`, `normal-case` | `text-transform` | n/a (keyword) |
| `truncate`, `text-ellipsis`, `text-clip` | `text-overflow` | n/a (keyword) |
| `underline`, `overline`, `line-through`, `no-underline` | `text-decoration-line` | n/a (keyword) |

**Note:** `text-{color}` classes (e.g. `text-red-500`) are categorized under **Color**, not Typography. The parser must distinguish between `text-{size}` (Typography) and `text-{color}` (Color) by checking whether the value after `text-` matches a known font size token or a known color token.

---

## Color

Classes that control text color, background color, border color, and other color properties. Displayed as a grid grouped by hue family.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `text-{color}` | `color` | `colors` |
| `bg-{color}` | `background-color` | `colors` |
| `border-{color}` | `border-color` | `colors` |
| `ring-{color}` | `--tw-ring-color` | `colors` |
| `outline-{color}` | `outline-color` | `colors` |
| `divide-{color}` | `border-color` (between children) | `colors` |
| `accent-{color}` | `accent-color` | `colors` |
| `caret-{color}` | `caret-color` | `colors` |
| `fill-{color}` | `fill` | `colors` |
| `stroke-{color}` | `stroke` | `colors` |
| `decoration-{color}` | `text-decoration-color` | `colors` |
| `shadow-{color}` | `--tw-shadow-color` | `colors` |
| `placeholder-{color}` | `::placeholder color` | `colors` |

**Color scale:** Tailwind default colors use a numeric shade scale: `50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`. Plus `black`, `white`, `transparent`, `current`, `inherit`.

**Color hue families (default palette):** `slate`, `gray`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`.

---

## Borders

Classes that control border radius, width, and style.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`, `rounded-none` | `border-radius` | `borderRadius` |
| `rounded-t-`, `rounded-r-`, `rounded-b-`, `rounded-l-` | per-side radius | `borderRadius` |
| `rounded-tl-`, `rounded-tr-`, `rounded-br-`, `rounded-bl-` | per-corner radius | `borderRadius` |
| `border`, `border-0`, `border-2`, `border-4`, `border-8` | `border-width` | `borderWidth` |
| `border-t-`, `border-r-`, `border-b-`, `border-l-` | per-side border width | `borderWidth` |
| `border-solid`, `border-dashed`, `border-dotted`, `border-double`, `border-hidden`, `border-none` | `border-style` | n/a (keyword) |

---

## Effects

Classes that control shadows, opacity, and blend modes.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `shadow`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, `shadow-inner`, `shadow-none` | `box-shadow` | `boxShadow` |
| `opacity-` | `opacity` | n/a (0–100 scale) |

---

## Layout

Classes that control display, position, overflow, and z-index.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `block`, `inline-block`, `inline`, `flex`, `inline-flex`, `grid`, `inline-grid`, `hidden`, `table`, `contents` | `display` | n/a (keyword) |
| `static`, `fixed`, `absolute`, `relative`, `sticky` | `position` | n/a (keyword) |
| `top-`, `right-`, `bottom-`, `left-`, `inset-` | position offsets | `spacing` |
| `z-` | `z-index` | `zIndex` |
| `overflow-auto`, `overflow-hidden`, `overflow-visible`, `overflow-scroll`, `overflow-x-*`, `overflow-y-*` | `overflow` | n/a (keyword) |

---

## Flexbox & Grid

Classes that control flex/grid container and item behavior.

| Prefix | CSS Property | Theme Key |
|--------|-------------|-----------|
| `flex-row`, `flex-row-reverse`, `flex-col`, `flex-col-reverse` | `flex-direction` | n/a (keyword) |
| `flex-wrap`, `flex-wrap-reverse`, `flex-nowrap` | `flex-wrap` | n/a (keyword) |
| `flex-1`, `flex-auto`, `flex-initial`, `flex-none` | `flex` | n/a (keyword) |
| `grow`, `grow-0` | `flex-grow` | n/a (keyword) |
| `shrink`, `shrink-0` | `flex-shrink` | n/a (keyword) |
| `basis-` | `flex-basis` | `spacing` + keywords |
| `justify-start`, `justify-end`, `justify-center`, `justify-between`, `justify-around`, `justify-evenly`, `justify-stretch` | `justify-content` | n/a (keyword) |
| `items-start`, `items-end`, `items-center`, `items-baseline`, `items-stretch` | `align-items` | n/a (keyword) |
| `self-auto`, `self-start`, `self-end`, `self-center`, `self-stretch`, `self-baseline` | `align-self` | n/a (keyword) |
| `grid-cols-` | `grid-template-columns` | n/a (1–12 + `none`) |
| `grid-rows-` | `grid-template-rows` | n/a (1–6 + `none`) |
| `col-span-` | `grid-column` | n/a |
| `row-span-` | `grid-row` | n/a |
| `order-` | `order` | n/a |

---

## Parsing Strategy

Given an element's class list (e.g. `"p-4 text-sm bg-white rounded-lg flex items-center"`):

1. Split by whitespace
2. Strip responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) and state prefixes (`hover:`, `focus:`, etc.) — these are not editable in the picker
3. For each remaining class, match against the prefix patterns above (longest match first)
4. Group into sections
5. Skip any class that doesn't match a known pattern

### Disambiguating `text-*`

The `text-` prefix is overloaded in Tailwind:
- **Font size:** `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`–`text-9xl`
- **Text color:** `text-{color}-{shade}` (e.g. `text-red-500`, `text-gray-900`)
- **Text align:** `text-left`, `text-center`, `text-right`, `text-justify`

Resolution order:
1. Check if it matches a known font size token → Typography
2. Check if it matches a known alignment keyword → Typography
3. Otherwise treat as color → Color
