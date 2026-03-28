## Plan: Toolbar + Panel Unified Redesign (3f spec)

The 3f spec unifies the overlay toolbar and panel into a shared Select/Insert mode system. The overlay toolbar gets `[Select|N+] + Insert` layout with a message row below elements. The panel header gets a segmented mode toggle replacing `SelectElementButton`. Panel tabs become mode-dependent: **Select → Design|Replace**, **Insert → Place**. The existing `DrawTab` splits into Replace/Place tabs. Message input moves from a panel tab to an inline overlay row.

### Execution Strategy

**Subagents:** Each phase is implemented by a subagent. The orchestrating agent passes this spec (or the relevant phase section) as the prompt, then verifies the result before moving to the next phase.

**Verification:** After each phase, use **Playwright MCP** to visually verify the result matches the design in the 3f HTML spec (`specs/033-panel-ux-redesign/3f-toolbar-panel-unified.html`). Open the spec in a browser to reference the target design, then compare against the running app. The dev environment must be running (use the `Dev: Test App` task or `Dev: SB8` task). Playwright MCP checks:
1. Navigate to `http://localhost:3333/panel/` (panel) and `http://localhost:5173` (test app)
2. Take screenshots and compare layout/styling against the spec HTML opened side-by-side
3. Interact with UI elements (click mode toggle, switch tabs, type in message row) to confirm behavior
4. Verify visual details: correct colors, spacing, active states, outline rings, font styles

**Styling:** Use Tailwind classes as much as possible for all panel components (React). Custom CSS is acceptable where Tailwind doesn't cover a need (e.g., overlay shadow DOM styles, complex animations). The overlay runs inside a shadow DOM and uses inline styles/CSS strings — Tailwind isn't available there, so custom CSS is expected.

**Tests:** Each phase that creates or modifies components must update or create unit tests. At the end (Phase 7), all existing tests must pass or be replaced:
- Tests referencing removed tabs ("Components", "Message") → delete or rewrite
- Tests referencing `SelectElementButton` → replace with `ModeToggle` tests
- New components (`ModeToggle`, `ReplaceTab`/`PlaceTab` or `ComponentPickerPanel`) → must have unit tests
- Run `cd panel && npm test` after each phase to confirm no regressions

### Current → Target

| Area | Current | Target |
|------|---------|--------|
| Overlay toolbar | Re-select \| Draw \| sep \| N+ | [Select \| N+] outlined group \| Insert btn |
| Panel header | `SelectElementButton` \| ComponentName \| `ContainerSwitcher` | `ModeToggle`(Select\|Insert) \| ElementName \| ContainerBtn |
| Panel tabs | Design \| Components \| Message (static) | Select: **Design \| Replace** — Insert: **Place** |
| Message input | Panel `MessageTab` textarea | Overlay inline row below element |
| Replace/Place tabs | N/A | Canvas option + Storybook component list |
| Toolbar action buttons | N/A | Select: Design · Text · Replace — Insert: Place |
| Text editing confirm | N/A | Floating action bar: "✓ Queue as Change" + "✕ Cancel" (like CanvasFooter) |

---

### Phase 1: Mode State Infrastructure
*Foundation — all other phases depend on this*

1. Add `mode: 'select' | 'insert'` state to [App.tsx](panel/src/App.tsx) (default: `'select'`)
2. Add `ModeChangedMessage` and `TabChangedMessage` types to [shared/types.ts](shared/types.ts)
3. Wire `MODE_CHANGED` and `TAB_CHANGED` WebSocket messages: panel ↔ overlay via [server/websocket.ts](server/websocket.ts)
4. Make `TABS` computed from `mode`:  select → `[Design, Replace]`, insert → `[Place]`
5. Auto-set `activeTab` to first tab of new mode on switch
6. Track mode in [overlay/src/index.ts](overlay/src/index.ts) (listen for `MODE_CHANGED`, default `'select'`)

**Verify:** Panel tabs change dynamically when mode changes — existing `TabBar` tests still pass

---

### Phase 2: Panel Mode Toggle Component
*Scaffold in parallel with Phase 1; integration requires Phase 1*

1. Create `ModeToggle` modlet in `panel/src/components/ModeToggle/` (segmented Select|Insert control)
   - Spec styling: `bg-[#1a1a1a]` container, active = `bg-bv-teal-dark text-[#5fd4da]`, inactive = `transparent text-bv-muted`
2. Replace inline `SelectElementButton` in both header layouts with `ModeToggle`
3. Select click → also triggers `TOGGLE_SELECT_MODE` on overlay
4. Insert click → activates insert/arm mode on overlay

**Verify:** ModeToggle unit test (active state, click handlers, WS messages)

---

### Phase 3: Replace Tab (Select Mode)
*Depends on Phase 1*

1. Extract `useComponentGroups` hook + `StorybookConnect` from [DrawTab.tsx](panel/src/components/DrawTab/DrawTab.tsx) into shared hooks
2. Create `ReplaceTab` modlet — canvas option (top) + Storybook component list (bottom)
3. Canvas option: a button/card that navigates into the existing `DesignCanvas` flow (does **not** duplicate `DesignCanvas` — reuses it with `insertMode: 'replace'`)
4. Component arm sends `insertMode: 'replace'` instead of default `'after'` — confirm overlay drop logic handles this value
5. Wire into [App.tsx](panel/src/App.tsx): `mode === 'select' && activeTab === 'replace'`

**Verify:** ReplaceTab renders canvas + components; arm sends correct `insertMode`

---

### Phase 4: Place Tab (Insert Mode)
*Depends on Phase 3 (shares extracted hooks)*

1. Create `PlaceTab` modlet (or shared `ComponentPickerPanel` used by both Replace and Place)
2. Same layout as Replace but with insert semantics (drop position determines `insertMode`)
3. Panel header shows "Pick a placement on the page" when in insert mode
4. Overlay activates drop-zone indicators (crosshair cursor, teal drop lines)

**Verify:** Place tab renders; insert mode shows correct header text; drop indicators in overlay

---

### Phase 5: Overlay Toolbar Redesign
*Depends on Phase 1 for mode state. This is the largest phase — consider splitting into 5a (layout + mode ring) and 5b (action buttons + tab sync) if needed.*

1. Replace [showDrawButton()](overlay/src/index.ts) with new layout:
   - **Left group** (teal outline ring when Select active): Select btn | separator | N+ btn
   - **Insert btn** (teal outline ring when Insert active)
   - **Separator** (1px vertical line)
   - **Right-side action buttons** (change based on mode):
     - Select mode: **Design** (filled teal when active tab) · **Text** · **Replace**
     - Insert mode: **Place** (filled teal)
2. Active mode gets `box-shadow: inset 0 0 0 1.5px #00848B` + teal text; inactive dims to `opacity: 0.4`
3. Active action button (Design/Replace/Place) gets filled teal (`background: var(--teal-dark); color: #5fd4da`)
4. Remove old Draw button from toolbar (canvas functionality now in Replace/Place tabs)
5. N+ button preserves existing group picker behavior
6. Mode clicks send `MODE_CHANGED` to panel
7. **Design** button click → sends message to panel to switch to Design tab
8. **Replace** button click → sends message to panel to switch to Replace tab
9. **Text** button click → activates inline text editing on the selected element (see Phase 8)
10. **Place** button click → sends message to panel to switch to Place tab
11. Toolbar listens for `TAB_CHANGED` from panel to keep right-side button highlight in sync

**Verify:** Toolbar layout matches 3f spec (including right-side buttons); mode ring toggles; action buttons highlight correctly; N+ still works; mode + tab syncs to panel

---

### Phase 6: Overlay Message Row
*Depends on Phase 5 (both modify overlay/src/index.ts — running truly in parallel causes merge conflicts)*

1. Add message row element below selected element (positioned with floating-ui, opposite side of toolbar)
   - Input: 190px wide, dark bg, 10px font, "add your message" placeholder
   - Send button: teal bg, white arrow icon
2. Send creates `MESSAGE_STAGE` patch (reuses existing WebSocket handler)
3. Enter submits, input clears after send, Escape blurs
4. Row appears/disappears with element selection lifecycle

**Verify:** Message row appears below element; typing + send creates message patch; clears after send

---

### Phase 7: Cleanup + Migration
*After all phases are working*

1. Remove old "Components" and "Message" tabs from `App.tsx`
2. Remove `showDrawPopover()` from overlay
3. Delete `MessageTab` component modlet (functionality moved to overlay)
4. Delete `DrawTab` component modlet (extracted into shared hooks; replaced by ReplaceTab/PlaceTab)
5. Update tests referencing old tab names or removed components
6. Verify Storybook addon still functions in embedded mode
7. Add at least one E2E test covering the overlay toolbar mode toggle + tab sync (overlay changes are highly visual/interactive and unit tests alone won't catch layout regressions)

**Verify:** No dead code referencing old tabs; all tests pass; full workflow: select → design → replace → place → message → commit

---

### Phase 8: Text Editing Integration
*Depends on Phase 5 (Text button in toolbar). Implements `specs/034-text-editing/spec.md`*

1. Add `text-change` patch kind to [shared/types.ts](shared/types.ts): `PatchKind = '...' | 'text-change'`
   - New optional fields on `Patch`: `originalHtml?: string`, `newHtml?: string`
   - New WS messages: `TEXT_EDIT_ACTIVE`, `TEXT_EDIT_DONE`
2. Create `overlay/src/text-edit.ts` module:
   - `startTextEdit(targetEl, deps)` — sets `contentEditable`, stores `originalHtml`, registers keydown/blur handlers
   - `endTextEdit(confirm)` — on confirm: builds `text-change` patch, sends `PATCH_STAGED`; on cancel: restores `originalHtml`
   - Escape = cancel, Cmd+Enter = confirm
   - Sends `TEXT_EDIT_ACTIVE` / `TEXT_EDIT_DONE` to panel
3. Show a floating action bar near the edited element (same pattern as `CanvasFooter`):
   - **"✓ Queue as Change"** button (teal filled) — confirms edit, calls `endTextEdit(true)`
   - **"✕ Cancel"** button (border style, orange on hover) — reverts, calls `endTextEdit(false)`
   - Positioned via floating-ui, near the toolbar or below the element
   - Removes the need for keyboard-only confirm — users have a visible affordance
   - Keyboard shortcuts (Cmd+Enter / Escape) still work as accelerators
4. Wire Text button in overlay toolbar to call `startTextEdit(currentTargetEl)`
5. Gate overlay message handlers while `isTextEditing === true` (ignore `PATCH_PREVIEW`, `PATCH_STAGE`, etc.)
6. Handle blur edge case: if blur is caused by clicking the action bar buttons, do **not** auto-confirm — let the button handler decide (use a short `requestAnimationFrame` guard to detect if blur target is within the action bar)
7. Panel: listen for `TEXT_EDIT_ACTIVE` → dim class editing UI; `TEXT_EDIT_DONE` → restore
8. Server queue: dedup `text-change` patches by `elementKey` only
9. MCP tools: add `text-change` to `buildCommitInstructions()` — emit old/new HTML + context for agent
10. Add `buildTextContext()` to [overlay/src/context.ts](overlay/src/context.ts)

**Verify:** Click Text button → element becomes contentEditable with teal dashed outline → floating action bar appears with "✓ Queue as Change" + "✕ Cancel" → type/format → click "✓ Queue as Change" (or Cmd+Enter) stages `text-change` patch → click "✕ Cancel" (or Escape) reverts → Mock MCP Client receives old/new HTML in agent instructions

---

### Decisions
- **Replace vs Place** share a common `ComponentPickerPanel` — only action text and `insertMode` differ
- **`selectModeActive`** state stays as a sub-state of select mode (active crosshair picking)
- **DrawTab fate**: extracted into shared hooks; `DrawTab` modlet directory deleted in Phase 7 cleanup
- **MessageTab fate**: deprecated — message input moves to overlay inline row
- **Toolbar ↔ panel sync**: Right-side action buttons and panel tabs stay in sync via bidirectional WS messages (`TAB_CHANGED` from panel, mode/tab switch messages from overlay)
- **Text editing**: Implemented as a separate phase (Phase 8) following `specs/034-text-editing/spec.md`

### Further Considerations
1. **Keyboard shortcuts** — should Select/Insert have shortcuts (e.g., V/I like Figma)? Recommend yes, add in Phase 5.
2. **Insert mode without Storybook** — Place tab shows canvas-only when Storybook isn't connected. Current `StorybookConnect` fallback handles this.
3. **Component-level preview cards** — the spec shows styled preview cards (Badge, Button, Card). Currently `ComponentGroupItem` renders these with ghost HTML. This should work as-is.
