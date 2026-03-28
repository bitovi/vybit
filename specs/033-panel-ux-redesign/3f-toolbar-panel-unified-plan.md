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

---

### Phase 1: Mode State Infrastructure
*Foundation — all other phases depend on this*

1. Add `mode: 'select' | 'insert'` state to [App.tsx](panel/src/App.tsx)
2. Add `ModeChangedMessage` type to [shared/types.ts](shared/types.ts)
3. Wire `MODE_CHANGED` WebSocket messages: panel ↔ overlay via [server/websocket.ts](server/websocket.ts)
4. Make `TABS` computed from `mode`:  select → `[Design, Replace]`, insert → `[Place]`
5. Auto-set `activeTab` to first tab of new mode on switch
6. Track mode in [overlay/src/index.ts](overlay/src/index.ts) (listen for `MODE_CHANGED`)

**Verify:** Panel tabs change dynamically when mode changes — existing `TabBar` tests still pass

---

### Phase 2: Panel Mode Toggle Component
*Parallel with Phase 1*

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
3. Component arm sends `insertMode: 'replace'` instead of default `'after'`
4. Canvas option triggers screenshot+annotate flow with `insertMode: 'replace'`
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
*Depends on Phase 1 for mode state*

1. Replace [showDrawButton()](overlay/src/index.ts) with new layout:
   - **Left group** (teal outline ring when Select active): Select btn | separator | N+ btn
   - **Insert btn** (teal outline ring when Insert active)
2. Active mode gets `box-shadow: inset 0 0 0 1.5px #00848B` + teal text; inactive dims to `opacity: 0.4`
3. Remove Draw button from toolbar (canvas functionality now in Replace/Place)
4. N+ button preserves existing group picker behavior
5. Mode clicks send `MODE_CHANGED` to panel

**Verify:** Toolbar layout matches spec; mode ring toggles; N+ still works; mode syncs to panel

---

### Phase 6: Overlay Message Row
*Parallel with Phase 5 (both in overlay, but independent)*

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
3. Deprecate or remove `MessageTab` component (functionality moved to overlay)
4. Update tests referencing old tab names
5. Verify Storybook addon still functions in embedded mode

**Verify:** No dead code referencing old tabs; all tests pass; full workflow: select → design → replace → place → message → commit

---

### Decisions
- **Replace vs Place** share a common `ComponentPickerPanel` — only action text and `insertMode` differ
- **`selectModeActive`** state stays as a sub-state of select mode (active crosshair picking)
- **DrawTab fate**: extracted into shared hooks; component itself replaced by ReplaceTab/PlaceTab
- **MessageTab fate**: deprecated — message input moves to overlay inline row

### Further Considerations
1. **Keyboard shortcuts** — should Select/Insert have shortcuts (e.g., V/I like Figma)? Recommend yes, add in Phase 5.
2. **Insert mode without Storybook** — Place tab shows canvas-only when Storybook isn't connected. Current `StorybookConnect` fallback handles this.
3. **Component-level preview cards** — the spec shows styled preview cards (Badge, Button, Card). Currently `ComponentGroupItem` renders these with ghost HTML. This should work as-is.
