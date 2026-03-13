# Axis Picker — Starter Spec (Post-MVP)

## Problem

In MVP, when a designer selects a spacing class like `p-3`, the picker only shows the full scale for that exact prefix: `p-0` through `p-96`. The designer can change the *value* but not the *axis*.

In reality, designers frequently need to split a uniform value into axis-specific or side-specific values. For example:

- `p-3` → `py-3` + `px-4` (different padding on vertical vs horizontal)
- `p-4` → `pt-6` + `pb-4` + `px-4` (different top/bottom with uniform horizontal)
- `m-2` → `mt-4` + `mb-2` + `mx-2` (adjust just the top margin)

This also applies in reverse — collapsing multiple axis values back into a shorthand:

- `pt-4` + `pb-4` + `pl-4` + `pr-4` → `p-4`

## Goal

Extend the picker UI so the designer can:

1. **See the current axis breakdown** — if an element has `p-3`, show that it applies to all four sides
2. **Split into axes** — tap a "split" control to break `p-3` into `py-3` + `px-3`, then adjust each independently
3. **Split into individual sides** — further break `py-3` into `pt-3` + `pb-3`
4. **Collapse back** — if all sides have the same value, offer a "merge" action to collapse back to the shorthand

## UI Concept

When a spacing class is selected in the picker:

```
┌─────────────────────────────────┐
│  padding                    p-3 │
│  ┌───────────────────────────┐  │
│  │         pt-3              │  │
│  │  pl-3   ┌────────┐ pr-3  │  │
│  │         │ element │       │  │
│  │         └────────┘       │  │
│  │         pb-3              │  │
│  └───────────────────────────┘  │
│                                 │
│  [All]  [X/Y]  [Individual]     │
│                                 │
│  Value: ◄ 0 1 2 [3] 4 6 8 ► │  │
└─────────────────────────────────┘
```

- **All mode** (default for `p-*`): one scale controls all sides
- **X/Y mode**: two scales — one for horizontal (`px-`), one for vertical (`py-`)
- **Individual mode**: four scales — `pt-`, `pr-`, `pb-`, `pl-`

The designer clicks a side in the box-model diagram to select which axis/side to adjust, then uses the scale below.

## Change Payload

When axis splitting produces a change, the payload must represent it as a multi-class substitution:

```json
{
  "change": {
    "property": "padding",
    "old": "p-3",
    "new": ["py-3", "px-4"]
  }
}
```

The agent must handle replacing one class with multiple classes in the source.

## Scope

This feature applies to all spacing-based properties:
- Padding: `p-` → `px-`/`py-` → `pt-`/`pr-`/`pb-`/`pl-`
- Margin: `m-` → `mx-`/`my-` → `mt-`/`mr-`/`mb-`/`ml-`
- Border radius: `rounded-` → `rounded-t-`/`rounded-b-` → `rounded-tl-`/`rounded-tr-`/`rounded-br-`/`rounded-bl-`
- Border width: `border-` → `border-t-`/`border-r-`/`border-b-`/`border-l-`

## Dependencies

- Requires the MVP picker to be working first
- Requires the agent to support multi-class substitution in the change payload
- The box-model diagram UI is new — needs design iteration

## Open Questions

- Should the box-model diagram be interactive (click to select a side) or just visual context?
- How do we handle logical properties (`ps-`, `pe-`, `ms-`, `me-`) alongside physical ones?
- Should collapsing suggest the merge automatically, or only when the designer asks?
