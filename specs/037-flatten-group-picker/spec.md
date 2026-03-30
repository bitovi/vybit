# 037 — Flatten Group Picker Popover

## Problem

The current `+` dropdown (group picker) has too much visual hierarchy for a small popover. Three section headings — **Selection**, **Add**, **Similar** — plus an empty state message ("No additional similar elements found") create unnecessary cognitive overhead. The "Click to add…" button uses an emoji (🎯) that feels out of place.

In practice, the "Add" checkboxes (exact matches, path matches) and "Similar" rows (near-group diffs) serve the same purpose: expanding the current selection. Separating them into distinct sections forces the user to parse headings instead of scanning a flat list of options.

## Current Behavior

Clicking the `N +` badge opens `showGroupPicker()` in `overlay/src/element-toolbar.ts` (~L320). The popover currently renders:

```
┌─ SELECTION ────────────────────────┐
│ [1] element selected               │
│                                    │
│ ─ ADD ─                            │
│ [☐] All exact matches (5)          │
│ [☐] All Button > button[0] (6)     │
│ 🎯 Click to add…                  │
│                                    │
│ ─ SIMILAR ─                        │
│ [☐] (3) +ring-2 +ring-blue-500    │
│ [☐] (1) -px-4                     │
│ — or —                             │
│ No additional similar elements found│
└────────────────────────────────────┘
```

## Proposed Design

Remove all section headings and dividers. Merge "Add" and "Similar" checkboxes into one flat list. Replace the emoji button with a plain text "Add more" toggle.

```
┌────────────────────────────────────┐
│ [1] element selected               │
│                                    │
│ Add more                           │
│                                    │
│ [☐] All exact matches (5)          │
│ [☐] All Button > button[0] (6)     │
│ [☐] (3) +ring-2 +ring-blue-500    │
│ [☐] (1) -px-4                     │
└────────────────────────────────────┘
```

When no exact matches or similar elements exist, only the element count and "Add more" button appear — no empty state message.

### Changes

1. **Remove "Selection" header** — delete the `el-picker-header` block (header div, title span).

2. **Keep element count row** — the `el-group-exact` row stays at the top: shows teal count chip + "element selected" label.

3. **Remove "Add" divider** — delete the `el-group-divider` for "Add".

4. **"Add more" button replaces "🎯 Click to add…"** — plain text, no emoji, styled with `color: #00848B; font-weight: 500`. Rendered immediately after the element count row (before any checkboxes). When active, text changes to "Adding… (click elements or press Esc)". Behavior is otherwise identical to the existing add-mode toggle.

5. **Merge all checkbox rows** — exact-match row, path-match row (React only), and near-group rows all render consecutively with no divider between them. Remove the "Similar" `el-group-divider`. Remove the `el-picker-list` wrapper div — append group rows directly to the picker.

6. **Remove empty state** — delete the "No additional similar elements found" `el-group-empty` element. If no checkboxes exist, the popover ends after the "Add more" button.

### Unchanged Behavior

- Checkbox toggle logic (`updateSelection()`) — unchanged
- Hover preview highlights on all rows — unchanged
- Add-mode click handler, Escape to exit — unchanged
- Shift+click to toggle selection — unchanged
- Picker close on outside click — unchanged
- Picker positioning (`positionWithFlip`) — unchanged

## Implementation

### Files to Modify

| File | What changes |
|---|---|
| `overlay/src/element-toolbar.ts` | Restructure `showGroupPicker()`: remove header, remove dividers, reorder button before checkboxes, flatten group rows, remove empty state |
| `overlay/src/styles.ts` | (Optional cleanup) Remove `.el-picker-header`, `.el-picker-title` styles if unused elsewhere |

### Detailed Steps — `showGroupPicker()` in `element-toolbar.ts`

**Delete:**
- `header` div creation + `picker.appendChild(header)` (the "SELECTION" heading)
- `addDivider` creation + `picker.appendChild(addDivider)` (the "ADD" divider)
- `divider` creation + `picker.appendChild(divider)` (the "SIMILAR" divider)
- Empty state block: `if (groups.length === 0) { … el-group-empty … }`
- `el-picker-list` wrapper div — group rows append directly to `picker`

**Modify:**
- `addBtn.innerHTML`: change from `<span …>🎯</span> Click to add…` → `Add more`
- Active state: change from `<span …>✓</span> Adding… (click elements or press Esc)` → `Adding… (click elements or press Esc)`

**Reorder DOM appends:**
1. `picker.appendChild(exactRow)` — element count
2. `picker.appendChild(addBtn)` — "Add more" toggle
3. `picker.appendChild(exactMatchRow)` — if exists
4. `picker.appendChild(pathMatchRow)` — if exists
5. `picker.appendChild(groupRow)` — for each near-group (directly on picker, no wrapper)

## Verification

1. Run `Dev: Test App` task, click an element, open the group picker via the `N +` badge
2. **No headings:** Confirm "SELECTION", "ADD", and "SIMILAR" headings do not appear
3. **Layout:** `(N) element selected` at top → "Add more" button → merged checkbox list
4. **Add mode:** "Add more" toggles to "Adding… (click elements or press Esc)"; clicking page elements adds them; Escape exits
5. **Checkboxes:** Toggling exact-match, path-match, and similar-group checkboxes updates the selection count, highlights, and sends `ELEMENT_SELECTED` to panel
6. **Hover previews:** Hovering any checkbox row shows dashed teal outlines on corresponding elements
7. **Empty case:** Select an element with no matches — only element count + "Add more" button visible, no "No similar elements found" message
