# Tailwind Visual Editor — Implementation Plan

This plan breaks the build into sequential phases. Each phase produces a working, testable checkpoint. Phases are ordered by dependency — later phases build on earlier ones.

---

## Phase 1: Project Scaffolding

**Goal:** Set up the repo, TypeScript config, dependencies, and build pipeline so all subsequent phases have a working dev loop.

### Steps

1. Initialize `package.json` with `name: "tailwind-visual-editor"`, a `bin` entry pointing to the compiled server entrypoint, and `"type": "module"`
2. Install dependencies:
   - **Server:** `express`, `cors`, `ws`, `@modelcontextprotocol/sdk`, `tailwindcss`
   - **Overlay:** `@floating-ui/dom` (bundled into the overlay)
   - **Dev:** `typescript`, `esbuild`, `@types/express`, `@types/ws`
3. Create `tsconfig.json` — target ES2022, module NodeNext, strict mode, outDir `dist/`
4. Create the directory structure per spec:
   ```
   server/
   overlay/src/
   overlay/dist/
   ```
5. Add npm scripts:
   - `build:server` — `tsc` to compile server TS to `dist/server/`
   - `build:overlay` — `esbuild overlay/src/index.ts --bundle --format=iife --outfile=overlay/dist/overlay.js`
   - `build` — runs both
   - `dev` — runs `build` then starts the server
6. Verify: `npm run build` completes with no errors on empty entrypoints

---

## Phase 2: MCP Server — Core

**Goal:** A running server that serves a placeholder overlay.js, exposes the WebSocket, and responds to MCP tools over stdio.

### Steps

1. **`server/queue.ts`** — In-memory change queue
   - `pendingChanges: ChangePayload[]`
   - `addChange(change)` — assigns auto-incremented id + timestamp, pushes
   - `getChanges()` — returns all pending
   - `markApplied(ids)` — removes matching ids, returns count
   - `clearAll()` — clears queue, returns count

2. **`server/tailwind.ts`** — Tailwind config resolver
   - Look for `tailwind.config.js` or `tailwind.config.ts` in cwd
   - Resolve using `tailwindcss/resolveConfig` (or fall back to default theme)
   - Extract `spacing`, `colors`, `fontSize`, `fontWeight`, `borderRadius`
   - Cache and export as JSON-serializable object

3. **`server/index.ts`** — Main server entrypoint
   - Start Express on `PORT` env var or `3333`
   - Enable CORS via `cors()` middleware
   - `GET /overlay.js` — serve `overlay/dist/overlay.js` statically
   - `GET /tailwind-config` — return cached resolved config as JSON
   - Start WebSocket server on the same HTTP server
   - On WS message: parse JSON, handle `CHANGE` → `queue.addChange()`, `PING` → respond `PONG`
   - Set up MCP server with `StdioServerTransport`:
     - Tool: `get_pending_changes` — returns `queue.getChanges()`
     - Tool: `mark_changes_applied` — calls `queue.markApplied(ids)`
     - Tool: `clear_pending_changes` — calls `queue.clearAll()`
   - Log server startup to stderr (not stdout — stdout is reserved for MCP stdio)

4. **Verify:**
   - `npm run dev` starts the server
   - `curl http://localhost:3333/tailwind-config` returns JSON
   - WebSocket connects from a test client
   - MCP tools respond over stdio (test manually or with MCP inspector)

---

## Phase 3: Overlay — Shadow DOM Host + Toggle Button

**Goal:** The overlay script loads in a browser, creates a Shadow DOM host, and renders a toggle button. No inspection yet.

### Steps

1. **`overlay/src/ws.ts`** — WebSocket client
   - Connect to `ws://localhost:3333` on load
   - Expose `send(data)` function
   - Handle disconnect: dispatch a custom event so the UI can show a toast
   - Handle reconnect attempts (simple retry with backoff)

2. **`overlay/src/index.ts`** — Entry point
   - Create a `<div>` element, attach it to `document.body`
   - Attach a Shadow DOM (`attachShadow({ mode: 'open' })`)
   - Inject a `<style>` tag inside the shadow root with all overlay CSS
   - Render the toggle button inside the shadow root
   - On toggle on: set `document.documentElement.style.cursor = 'crosshair'`, attach click listener
   - On toggle off: revert cursor, remove click listener
   - Initialize WebSocket connection

3. **Build & Verify:**
   - `npm run build:overlay` produces `overlay/dist/overlay.js`
   - Add `<script src="http://localhost:3333/overlay.js"></script>` to a test React app
   - Toggle button appears in bottom-right, click toggles cursor to crosshair
   - Check: app's own styles are not affected by overlay CSS (Shadow DOM isolation)

---

## Phase 4: Overlay — Fiber Tree Walking

**Goal:** Clicking an element in inspect mode identifies the nearest React component, finds all instances, and highlights them.

### Steps

1. **`overlay/src/fiber.ts`** — Fiber utilities
   - `getFiber(domNode)` — find `__reactFiber$*` key on node, return fiber
   - `findComponentBoundary(fiber)` — walk `.return` until `fiber.type` is a function/class, return `{ fiber, componentType, componentName }`
   - `getRootFiber()` — find `__reactContainer$*` on `document.getElementById('root')`, return root fiber
   - `findAllInstances(rootFiber, componentType)` — recursive DFS, collect all fibers where `fiber.type === componentType`
   - `getChildPath(componentFiber, targetFiber)` — compute child index path from component root to target
   - `resolvePathToDOM(instanceFiber, path)` — follow path in another instance, return DOM node or null
   - `getDOMNode(fiber)` — walk `fiber.child` down to first HostComponent, return its `stateNode`

2. **Wire into click handler** (`index.ts`):
   - On click (in inspect mode): call `getFiber`, `findComponentBoundary`, `findAllInstances`
   - Highlight all instances with a subtle outline (manipulate style on the DOM nodes from inside the shadow root — use an overlay div positioned absolutely over each instance)
   - Log component name and instance count to console for debugging

3. **Verify:**
   - Click any element in test React app while inspector is on
   - Console logs component name + correct instance count
   - All instances get a visible highlight outline

---

## Phase 5: Overlay — Picker UI (Scale Properties)

**Goal:** After clicking an element, show the picker panel with the element's Tailwind classes grouped by category, and a scale selector for non-color properties.

### Steps

1. **`overlay/src/class-parser.ts`** (new file) — Tailwind class parser
   - Given a class list string, parse into categorized groups using prefix matching from `tailwind-class-mappings.md`
   - Handle `text-*` disambiguation (font size vs color vs alignment)
   - Return: `{ category: string, prefix: string, value: string, fullClass: string }[]`

2. **`overlay/src/picker.ts`** — Picker panel
   - Create picker DOM inside shadow root
   - Header: component name + instance count
   - Body: list detected classes, grouped by category (Spacing, Typography, etc.)
   - On class click: fetch `/tailwind-config`, generate the scale for that prefix
   - Render scale as a horizontal row of clickable chips, current value highlighted
   - On hover over a chip: apply live preview (swap class on clicked element + all instance equivalents)
   - On click of a chip: lock selection, show Queue Change + Discard buttons
   - Position picker using Floating UI `computePosition` with `flip()` and `shift()` middleware, anchored to clicked element
   - Discard button: revert DOM changes, close picker
   - Toast component for error/confirmation messages

3. **Verify:**
   - Click an element with spacing classes → picker shows grouped classes
   - Click a spacing class → scale appears
   - Hover over scale values → live preview on the element + all instances
   - Click a value → Queue/Discard buttons appear

---

## Phase 6: Overlay — Color Picker Grid

**Goal:** For color classes, show a hue-grouped grid instead of a linear scale.

### Steps

1. Extend `picker.ts` to detect when a class maps to category "Color"
2. Fetch color data from `/tailwind-config` (`theme.colors`)
3. Render a grid: one row per hue family (slate, gray, zinc, ..., rose), columns are shades (50–950)
4. Each cell is a small square showing the actual color
5. Current color is outlined/highlighted
6. On hover: live preview. On click: lock selection (same flow as scale picker)

### Verify:
- Click element with `bg-blue-500` → color grid appears
- Hover over `bg-red-300` → element changes live
- Grid is organized by hue rows

---

## Phase 7: Overlay — Context Builder + Queue Submission

**Goal:** When the designer clicks "Queue Change", build the pseudo-HTML context and send the complete payload over WebSocket to the server.

### Steps

1. **`overlay/src/context.ts`** — Pseudo-HTML builder
   - Walk from target element up to `<body>`, collecting ancestors
   - At each level, include up to 3 siblings on each side
   - Prune nodes with no classes/text/id (unless direct ancestor)
   - Collapse unrelated subtrees to `...`
   - Mark target element with `<!-- TARGET: change X → Y -->` comment
   - Include trimmed `innerText` (max 60 chars)
   - Return formatted, indented HTML string

2. Wire "Queue Change" button:
   - Build context string
   - Construct full `CHANGE` payload (component name, target info, old/new class, context)
   - Send via WebSocket
   - Show confirmation toast

3. **Verify:**
   - Queue a change → server logs receipt
   - Call MCP `get_pending_changes` tool → returns the queued change with correct context
   - Context string looks like the spec example
   - Call `mark_changes_applied` → change is removed from queue

---

## Phase 8: End-to-End Integration Test

**Goal:** Verify the full flow works: overlay → server → MCP tool → agent applies change.

### Steps

1. Set up a simple React test app (e.g. a page with a `Button` component used 3 times)
2. Start the MCP server
3. Add the overlay script tag to the test app
4. In the browser: toggle inspector on, click a button, change `bg-blue-500` to `bg-red-500`, queue it
5. In the agent (or manually via MCP inspector): call `get_pending_changes`, verify the payload
6. Manually apply the change to source as the agent would
7. Call `mark_changes_applied`
8. Verify queue is empty

### Success Criteria

- Full round-trip works with no crashes
- Context string correctly identifies the target element
- Live preview updates all instances
- Shadow DOM isolates overlay styles
- CORS works cross-origin
- Server starts cleanly via `npx` / bin entry
- MCP tools return correct data over stdio

---

## Dependency Graph

```
Phase 1 (scaffolding)
  ↓
Phase 2 (server core)
  ↓
Phase 3 (overlay shell + toggle) ← depends on server serving overlay.js
  ↓
Phase 4 (fiber walking) ← depends on overlay running in a React app
  ↓
Phase 5 (picker UI - scales) ← depends on fiber detection + tailwind-config endpoint
  ↓
Phase 6 (color picker grid) ← depends on picker UI foundation
  ↓
Phase 7 (context builder + queue) ← depends on picker + WebSocket
  ↓
Phase 8 (integration test) ← depends on everything
```

---

## Key Dependencies / Packages

| Package | Purpose | Used In |
|---------|---------|---------|
| `express` | HTTP server | Server |
| `cors` | CORS middleware | Server |
| `ws` | WebSocket server | Server |
| `@modelcontextprotocol/sdk` | MCP protocol + stdio transport | Server |
| `tailwindcss` | `resolveConfig` for theme extraction | Server |
| `@floating-ui/dom` | Picker positioning | Overlay (bundled) |
| `esbuild` | Bundle overlay to IIFE | Build |
| `typescript` | Type checking | Build |
