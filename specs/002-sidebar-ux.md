# Container-Agnostic Panel Architecture

## Motivation

The picker UI currently renders as a floating modal inside the overlay's Shadow DOM, positioned with Floating UI next to the selected element. This works but has drawbacks:

- It competes for space with the element it's inspecting
- It can't be resized or repositioned
- A sidebar-style UI (like DevTools) would be more natural, but injecting a sidebar into an arbitrary site's DOM conflicts with body/html styles, fixed layouts, `100vh` containers, and scroll behavior

The solution: extract the picker into a standalone **Panel** app served by the MCP server, and let **Container** implementations decide how to host it. The Panel code is identical regardless of container.

## Vocabulary

| Term | Definition |
|------|-----------|
| **Toggle** | The injected button in the inspected page (bottom-right ⊕). Activates inspection mode and opens the Panel in the active Container. |
| **Panel** | A React app served at `GET /panel`. Shows the class picker UI. Connects to the WS server. |
| **Patcher** | Logic in the overlay that applies/reverts class changes to the live DOM (highlight, preview, commit). |
| **Container** | Abstraction for how the Panel is hosted. Four implementations. |

## Current State (what exists today)

**Overlay** (`overlay/src/`): Single IIFE bundle injected via `<script>`. All UI lives in a Shadow DOM attached to `<div id="tw-visual-editor-host">`. Contains:
- Toggle button (CSS class `.toggle-btn`, rendered in `index.ts`)
- Picker panel (CSS class `.picker-panel`, rendered by `showPicker()` in `picker.ts`)
- Highlight overlays (CSS class `.highlight-overlay`)
- Toast notifications
- Preview/revert logic (applies class swaps to DOM, fetches CSS from `/css` endpoint)
- WebSocket client (`ws.ts`) — sends `CHANGE` messages, receives `PONG`

**Server** (`server/index.ts`): Express + WS + MCP (stdio). Routes:
- `GET /overlay.js` — serves the overlay bundle
- `GET /tailwind-config` — resolved Tailwind config for scale values/colors
- `POST /css` — generates CSS for arbitrary class names (for preview)
- WebSocket — receives `CHANGE` and `PING`, adds to queue
- MCP tools: `get_pending_changes`, `mark_changes_applied`, `clear_pending_changes`

## Target Architecture

```
┌─────────────────────────────────────────────────────┐
│  Inspected Page                                     │
│                                                     │
│  ┌───────────── Shadow DOM ──────────────────┐      │
│  │  Toggle (⊕ button)                        │      │
│  │  Patcher (highlight, preview, revert)     │      │
│  │  Container host (iframe or popup ref)     │      │
│  └───────────────────────────────────────────┘      │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket
                       ▼
              ┌─────────────────┐
              │   MCP Server    │
              │  (port 3333)    │
              │                 │
              │  WS role router │
              │  GET /panel     │
              │  GET /overlay.js│
              │  POST /css      │
              │  ...            │
              └────────┬────────┘
                       │ WebSocket
                       ▼
        ┌──────────────────────────────────┐
        │  Panel (React app)               │
        │  Hosted in one of:               │
        │  - Popover (iframe)              │
        │  - Modal (iframe)                │
        │  - Sidebar (iframe)              │
        │  - Popup (window.open)           │
        └──────────────────────────────────┘
```

### Communication: WS-only, uniform across all containers

All 4 container types use the WS server as message bus. The Panel always loads from `http://localhost:3333/panel`. No `postMessage` — the same WS path works identically for iframes and popup windows.

**New WS message types:**

| Message | Direction | Payload |
|---------|-----------|---------|
| `REGISTER` | client → server | `{ role: 'overlay' \| 'panel' }` |
| `ELEMENT_SELECTED` | overlay → panel | `{ componentName, instanceCount, classes, tailwindConfig }` |
| `CLASS_PREVIEW` | panel → overlay | `{ oldClass, newClass }` |
| `CLASS_REVERT` | panel → overlay | `{}` |
| `CLASS_COMMIT` | panel → overlay | `{ oldClass, newClass, property }` |
| `CHANGE` | panel → server | (existing shape — component, target, change, context) |
| `SWITCH_CONTAINER` | panel → overlay | `{ container: 'modal' \| 'popover' \| 'sidebar' \| 'popup' }` |

**Server routing logic:** On `REGISTER`, tag the WS connection with its role. On any message with a `to` field, forward to all connections registered with that role. `CHANGE` messages (no `to` field) are handled by the server directly (existing queue behavior).

### Container Interface

```typescript
interface IContainer {
  readonly name: 'modal' | 'popover' | 'sidebar' | 'popup';
  open(panelUrl: string): void;
  close(): void;
  isOpen(): boolean;
}
```

**Implementations:**

| Container | Host mechanism | Layout impact | Notes |
|-----------|---------------|---------------|-------|
| **PopoverContainer** | Fixed `<iframe>` in Shadow DOM, covers page | None | Default. Like the current modal but full panel UI. |
| **ModalContainer** | Fixed `<iframe>` in Shadow DOM, draggable + resizable | None | Drag handle at top, resize gripper at corner. Position/size stored in `localStorage`. |
| **SidebarContainer** | Fixed `<iframe>` docked to right or bottom edge | Adds `padding-right` or `padding-bottom` to `<html>` element | Known limitation: breaks on sites with `height: 100vh` on body, custom scroll containers, or `position: fixed` elements at the edge. |
| **PopupContainer** | `window.open(url, 'tw-panel', 'popup,width=420,height=700')` | None | Survives page navigations (Panel stays open; overlay reconnects). Requires one-time "allow popups" in browser. |

All containers open the same URL: `http://localhost:3333/panel`

### Container Switching

A button inside the Panel sends `SWITCH_CONTAINER` over WS → overlay receives it → closes current container → opens new container. Last-used container is stored in `localStorage` by the Panel. The Toggle always opens the last-used container.

## File Plan

### New files

```
overlay/src/containers/
  IContainer.ts         — interface
  PopoverContainer.ts   — fixed iframe overlay
  ModalContainer.ts     — draggable/resizable iframe
  SidebarContainer.ts   — docked iframe + body padding
  PopupContainer.ts     — window.open

overlay/src/patcher.ts  — extracted preview/revert/commit logic
overlay/src/messages.ts — shared message type definitions

panel/
  index.html            — entry HTML served at /panel
  src/
    main.tsx            — React entry point
    App.tsx             — root component, WS connection, container switcher
    ws.ts               — WS client (same pattern as overlay/src/ws.ts)
    components/
      Picker.tsx        — class picker UI (ported from overlay/src/picker.ts)
      ColorGrid.tsx     — color grid (ported from picker.ts renderColorGrid)
      ScaleRow.tsx      — linear scale chips
      ContainerSwitcher.tsx — button group to switch container type
  tsconfig.json
  vite.config.ts
```

### Modified files

| File | Changes |
|------|---------|
| `server/index.ts` | Add WS role registry + routing. Add `GET /panel` static serving. |
| `overlay/src/index.ts` | Remove `showPicker()` calls and picker CSS. Extract preview/revert into `patcher.ts`. Add Container management. Toggle opens active Container. Listen for `SWITCH_CONTAINER`. Send `ELEMENT_SELECTED` on element pick. |
| `overlay/src/ws.ts` | Add `send` wrapper that attaches `to` field. Send `REGISTER { role: 'overlay' }` on connect. |
| `package.json` | Add `build:panel` script (Vite build). Update `build` to run both `build:overlay` and `build:panel`. |

### Deleted files (after Panel is complete)

| File | Reason |
|------|--------|
| `overlay/src/picker.ts` | Logic moved to `panel/src/components/Picker.tsx` |

## Implementation Phases

### Phase 1: WS Protocol & Server Routing

**Goal:** Server can route messages between overlay and panel by role.

1. Create `overlay/src/messages.ts` with TypeScript types for all message shapes (`Register`, `ElementSelected`, `ClassPreview`, `ClassRevert`, `ClassCommit`, `SwitchContainer`). This file is types-only — imported by both overlay and panel builds.

2. Update `server/index.ts`:
   - Add a `Map<WebSocket, string>` to track each connection's role
   - On `REGISTER` message: store the role, log it
   - On messages with a `to` field: iterate all connections, forward to those whose role matches `to`
   - Existing `CHANGE` handling stays the same (no `to` field → server processes it)
   - `PING`/`PONG` stays the same

3. Update `overlay/src/ws.ts`:
   - On connect, send `REGISTER { role: 'overlay' }`
   - Export a `sendTo(role, data)` helper that adds `{ to: role }` to the message

4. Add `GET /panel` route to `server/index.ts` that serves `panel/dist/index.html`. Add `GET /panel/assets/*` for Vite build assets (static file serving from `panel/dist/`).

**Verify:** Start server, connect two WS clients (e.g. via `wscat`), register as different roles, confirm messages route correctly.

### Phase 2: Container Implementations

**Goal:** Four container classes that can open/close the Panel URL.

5. Create `overlay/src/containers/IContainer.ts`:
   ```typescript
   export interface IContainer {
     readonly name: 'modal' | 'popover' | 'sidebar' | 'popup';
     open(panelUrl: string): void;
     close(): void;
     isOpen(): boolean;
   }
   ```

6. **PopoverContainer** (`overlay/src/containers/PopoverContainer.ts`):
   - Creates a `<div>` in Shadow DOM with `position: fixed; top: 0; right: 0; width: 400px; height: 100vh; z-index: 999999;`
   - Inside: `<iframe src="{panelUrl}" style="width:100%; height:100%; border:none;">`
   - `close()` removes the div
   - `isOpen()` checks if the div exists in Shadow DOM

7. **ModalContainer** (`overlay/src/containers/ModalContainer.ts`):
   - Same iframe approach but with `position: fixed; top: 80px; left: calc(100vw - 440px); width: 400px; height: 600px;`
   - Drag handle: top bar div, `mousedown` → track `mousemove` on `document`, update `top`/`left`
   - Resize gripper: bottom-right corner div, `mousedown` → track `mousemove`, update `width`/`height`
   - Save position/size to `localStorage` key `tw-modal-bounds` on `mouseup`; restore on `open()`

8. **SidebarContainer** (`overlay/src/containers/SidebarContainer.ts`):
   - Same iframe but docked: `position: fixed; top: 0; right: 0; width: 380px; height: 100vh;`
   - On `open()`: save original `document.documentElement.style.paddingRight`, set `paddingRight: '380px'`
   - On `close()`: restore original padding
   - Resize handle on the left edge: drag to change width, update iframe width + padding
   - Known limitation: document in spec that this may conflict with sites that style `<html>` or `<body>` with fixed heights, overflow hidden, or edge-positioned fixed elements

9. **PopupContainer** (`overlay/src/containers/PopupContainer.ts`):
   - `open()`: `this.popup = window.open(panelUrl, 'tw-panel', 'popup,width=420,height=700')`
   - If `this.popup` already exists and not closed: `this.popup.focus()` instead of opening new
   - `close()`: `this.popup?.close()`
   - `isOpen()`: `this.popup != null && !this.popup.closed`

### Phase 3: Panel App

**Goal:** React app that replicates the picker UI, connects via WS.

10. Scaffold `panel/` with Vite + React + TypeScript:
    - `panel/index.html` — standard Vite entry, `<div id="root">`
    - `panel/vite.config.ts` — set `base: '/panel/'` so assets resolve correctly when served from `/panel/`
    - `panel/tsconfig.json`
    - `panel/package.json` — React, ReactDOM as dependencies

11. Create `panel/src/ws.ts`:
    - Same pattern as `overlay/src/ws.ts`
    - On connect: send `REGISTER { role: 'panel' }`
    - Derive WS URL from `window.location.origin` (replace `http` → `ws`)
    - Export `send`, `onMessage`, `isConnected`

12. Create `panel/src/components/Picker.tsx`:
    - Port the logic from `overlay/src/picker.ts` into React components
    - Props: `{ componentName, instanceCount, parsedClasses, tailwindConfig }`
    - On chip click → expand scale/color grid (React state, not DOM manipulation)
    - On scale hover → call `send({ type: 'CLASS_PREVIEW', to: 'overlay', oldClass, newClass })`
    - On scale leave → call `send({ type: 'CLASS_REVERT', to: 'overlay' })`
    - On scale click (lock) → call `send({ type: 'CLASS_COMMIT', to: 'overlay', oldClass, newClass, property })`
    - On "Queue Change" → call `send({ type: 'CHANGE', component, target, change, context })` (to server)
    - On "Discard" → call `send({ type: 'CLASS_REVERT', to: 'overlay' })`

13. Create `panel/src/components/ColorGrid.tsx`:
    - Port `renderColorGrid` / `createColorCell` logic to React
    - Same visual design (Catppuccin theme, hue rows, shade columns)

14. Create `panel/src/components/ScaleRow.tsx`:
    - Port `getScaleValues` and scale chip rendering to React
    - Current/preview/locked states via React state

15. Create `panel/src/components/ContainerSwitcher.tsx`:
    - Four icon/label buttons: Popover, Modal, Sidebar, Popup
    - Active state for current container (read from `localStorage`)
    - On click: update `localStorage`, send `{ type: 'SWITCH_CONTAINER', to: 'overlay', container: name }`

16. Create `panel/src/App.tsx`:
    - Connect WS on mount
    - Listen for `ELEMENT_SELECTED` → store in state → render `<Picker>`
    - Show "Click an element to inspect" when no element selected
    - Show "Waiting for connection…" when WS disconnected
    - Render `<ContainerSwitcher>` in a header/toolbar area

17. Add styles — use the existing Catppuccin dark theme colors from the current picker CSS. Can use inline styles, CSS modules, or a `<style>` tag in `index.html`.

18. Update `package.json`:
    - Add `"build:panel": "cd panel && npx vite build"`
    - Update `"build": "npm run build:overlay && npm run build:panel"`

### Phase 4: Overlay Refactor

**Goal:** Overlay sends element data over WS instead of rendering picker. Patcher responds to WS commands.

19. Create `overlay/src/patcher.ts`:
    - Move `previewState`, `previewStyleEl`, `onPreview()`, `onRevert()` logic from `index.ts` into exported functions:
      - `applyPreview(elements: HTMLElement[], oldClass: string, newClass: string, serverOrigin: string): Promise<void>`
      - `revertPreview(): void`
      - `commitPreview(): { elements: HTMLElement[], originalClasses: string[] } | null`
    - This is pure Patcher logic — no UI

20. Update `overlay/src/index.ts`:
    - Remove all picker CSS (`.picker-panel`, `.picker-class-chip`, `.picker-scale`, `.picker-scale-chip`, `.picker-actions`, `.picker-btn`, `.picker-btn-queue`, `.picker-btn-discard`, `.color-grid`, `.color-row`, `.color-hue-label`, `.color-cell` rules)
    - Remove `import { showPicker, closePicker } from './picker'`
    - Add `import { applyPreview, revertPreview } from './patcher'`
    - Add Container imports and management:
      ```typescript
      import { PopoverContainer } from './containers/PopoverContainer';
      import { ModalContainer } from './containers/ModalContainer';
      import { SidebarContainer } from './containers/SidebarContainer';
      import { PopupContainer } from './containers/PopupContainer';

      const containers: Record<string, IContainer> = {
        popover: new PopoverContainer(shadowRoot),
        modal: new ModalContainer(shadowRoot),
        sidebar: new SidebarContainer(shadowRoot),
        popup: new PopupContainer(),
      };
      let activeContainer: IContainer = containers['popover'];
      ```
    - In `toggleInspect()`: also open/close the active container
    - In `clickHandler()`: instead of calling `showPicker()`, gather the element data and send `ELEMENT_SELECTED` over WS:
      ```typescript
      sendTo('panel', {
        type: 'ELEMENT_SELECTED',
        componentName: boundary.componentName,
        instanceCount: instances.length,
        classes: classString,
        tailwindConfig: config,
      });
      ```
    - Store selected element refs + equivalentNodes in module state so Patcher can access them
    - Register WS message handlers:
      - `CLASS_PREVIEW` → call `applyPreview(equivalentNodes, msg.oldClass, msg.newClass, SERVER_ORIGIN)`
      - `CLASS_REVERT` → call `revertPreview()`
      - `CLASS_COMMIT` → same as current `onQueue`, but data comes from WS instead of picker callback
      - `SWITCH_CONTAINER` → `activeContainer.close()`, set `activeContainer = containers[msg.container]`, `activeContainer.open(panelUrl)`

21. Update `overlay/src/ws.ts`:
    - On connect: `send({ type: 'REGISTER', role: 'overlay' })`
    - Add `sendTo(role: string, data: object)` that wraps data with `{ ...data, to: role }`

22. Remove `overlay/src/picker.ts` — all functionality now lives in `panel/src/components/`.

### Phase 5: Build & Integration

23. Install panel dependencies:
    ```
    cd panel && npm install react react-dom && npm install -D @types/react @types/react-dom vite @vitejs/plugin-react typescript
    ```

24. Verify build pipeline:
    ```
    npm run build        # builds overlay/dist/overlay.js + panel/dist/
    npm run dev          # builds + starts server
    ```

25. Verify `GET /panel` serves the built Panel app.

### Phase 6: Testing

26. Manual test: Popover container — Toggle → pick element → Panel shows classes → hover preview → commit → toast
27. Manual test: Modal container — switch via Panel button → drag, resize → pick element → flow works
28. Manual test: Sidebar container — switch → page content shrinks → pick element → flow works → document known issues
29. Manual test: Popup container — switch → new window opens → pick element in main page → flow works → navigate page → panel shows "reconnecting..."
30. Run existing E2E tests (`test-app/e2e/`) — verify no regressions on overlay behavior

## Known Limitations & Risks

| Risk | Mitigation |
|------|-----------|
| **Sidebar breaks on some sites** | Document as known limitation. Sidebar adds `paddingRight` to `<html>` — sites with `height: 100vh` on body, `overflow: hidden`, or fixed-positioned edge elements will have issues. |
| **Popup blocked by browser** | `window.open` on a user click (Toggle button) is allowed by all major browsers. Only programmatic opens (not user-initiated) are blocked. |
| **Context string for CHANGE** | Currently `buildContext()` runs in the overlay (has DOM access). The Panel doesn't have DOM access, so context building stays in the overlay. On `CLASS_COMMIT`, the overlay builds context and sends the full `CHANGE` to the server. |
| **Panel needs `tailwindConfig`** | Sent as part of `ELEMENT_SELECTED`. Config is already fetched and cached by the overlay from `GET /tailwind-config`. |
| **Popup window loses focus** | When user clicks an element in the inspected page, popup doesn't auto-focus. This is by design — the user is working in the page. The popup updates in the background. |
| **Multiple tabs/pages** | Only one overlay ↔ panel pair is expected at a time. Server broadcasts to all clients of a role — if multiple pages are open, messages fan out to all. Future: add session IDs. |

## Decisions Log

- Panel is always a separate HTML page served from the server — never rendered as DOM into the Shadow DOM directly
- WebSocket is the only communication channel — no `postMessage`, no `BroadcastChannel`. Same code path for all 4 containers
- Default container: Popover (closest to current behavior, zero layout impact)
- Container preference stored in Panel's `localStorage`
- `class-parser.ts`, `fiber.ts`, `context.ts` stay in the overlay (they need DOM access)
- `picker.ts` functionality moves entirely to Panel React components
- Catppuccin dark theme carries over to Panel app
