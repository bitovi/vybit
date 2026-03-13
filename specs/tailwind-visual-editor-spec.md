# Tailwind Visual Editor — Implementation Spec

## Overview

A dev-only tool that lets designers click any element in a running React app, pick a new Tailwind class value from a constrained picker, preview the change live across all instances of that component on the page, and then hand off to an AI agent to apply the change in source code.

Three parts:

1. **A JS overlay** — injected into the running app in dev mode. Handles click detection, uses React's fiber tree to find component boundaries and all instances, renders the picker UI, applies live DOM previews, captures rich context, sends queued changes to the MCP server.
2. **An MCP server** — a local Node.js process. Serves the overlay JS file, maintains a WebSocket connection, queues pending changes, exposes MCP tools for the agent, serves the resolved Tailwind config.
3. **The agent** — uses MCP tools to retrieve pending changes and apply them to source files.

---

## Part 1: JS Overlay

### Injection

The overlay is a single JS file served by the MCP server. In dev mode, add a script tag to the app's HTML entry point (e.g. `index.html`):

```html
<script src="http://localhost:3333/overlay.js"></script>
```

Only include this in development. On load, the overlay opens a WebSocket connection to `ws://localhost:3333`.

### Toggle Button

The overlay renders a small fixed-position button in the bottom-right corner of the page (high z-index, never obscured by app content). It is always visible while the overlay script is loaded.

- **Off state** — subtle, small, unobtrusive. A crosshair or cursor icon. Should not visually compete with the app.
- **On state** — clearly active. Different background color (e.g. blue). Cursor changes to `crosshair` on the document so the designer knows they are in inspect mode.

Clicking the toggle button switches between off and on. It never triggers the element picker itself.

When **off**: no event listeners are attached. The app behaves completely normally.

When **on**: the click listener is attached (see below) and the document cursor changes to `crosshair`.

### Click Detection

The overlay listens for `click` events on the document with `capture: true` and `preventDefault()` so clicks don't trigger app behavior while the tool is active. This listener is only attached when the toggle is on.

On click:

1. Get the clicked DOM element
2. Use the fiber tree to find the nearest React component boundary (see below)
3. Find all other instances of that component currently mounted (see below)
4. Show the picker UI near the clicked element
5. Highlight all instances on the page subtly (e.g. a faint outline) so the designer sees scope

### Using the React Fiber Tree

Every DOM node in a React dev build has a property beginning with `__reactFiber` attached to it (the suffix is a random hash — sniff for it by checking `Object.keys(domNode)` for a key starting with `__reactFiber`).

#### Finding the nearest component boundary

Walk `.return` up the fiber tree from the clicked element's fiber until you find a fiber where `fiber.type` is a function or class. That is the nearest React component. Record:

- `fiber.type` — the component function itself (used for instance matching)
- `fiber.type.name` or `fiber.type.displayName` — the component name for display

#### Finding all instances of the component

Walk the entire fiber tree from the React root to find all mounted fibers where `fiber.type === targetComponentType`.

**React 18 root detection (MVP):** The root fiber is accessible via the `__reactContainer$` property on the root DOM node. Scan `Object.keys(document.getElementById('root'))` for a key starting with `__reactContainer$` — its value is the root fiber. From there, walk `fiber.child` recursively to traverse the tree. React 17 support is deferred to post-MVP.

For each matching fiber, get its DOM node via `fiber.stateNode` if it's a host component, or walk `fiber.child` down to the first host component.

#### Finding the equivalent child element in each instance

The designer clicked a specific child element inside the component (e.g. the `<button>` inside `MyButton`). To find the equivalent child in each other instance:

1. Record the path from the component root fiber down to the clicked element's fiber as a sequence of child indices: e.g. `[0, 1]` meaning "first child, then second child"
2. Apply that same path walking `fiber.child` and `fiber.sibling` for each other instance
3. Get the DOM node at that path

This will be imprecise in cases with conditional rendering or list rendering — that is acceptable. The goal is to give the designer a feel for the change across the page, not pixel-perfect correctness. Instances where the path can't be resolved are simply skipped.

### Picker UI

A small floating panel appears near the clicked element, positioned using **Floating UI** (`@floating-ui/dom`) with flip and shift middleware for smart viewport-aware placement. Post-MVP: explore opening the picker in a separate browser window.

The picker and all overlay UI (toggle button, highlight outlines) are rendered inside a **Shadow DOM** host element to fully isolate styles from the app. All overlay CSS lives inside the shadow root.

The picker shows **one property at a time**. The designer clicks a detected class to select it, and the picker expands the scale for that property. It should:

- Show the component name and instance count: *"MyButton — 12 instances on this page"*
- List all detected Tailwind classes on the clicked element, grouped into sections: **Spacing**, **Typography**, **Layout**, **Color** (see `tailwind-class-mappings.md` for the prefix → category mapping)
- When a class is selected, show the full Tailwind scale for that prefix as selectable options fetched from `GET /tailwind-config`
- Highlight the current value in the scale
- For MVP, keep the same prefix and vary the value (e.g. `p-2` shows `p-0` through `p-96`). Axis splitting (e.g. changing `p-3` to `py-3` + `px-4`) is post-MVP (see `axis-picker-spec.md`).

**Color picker:** Colors are displayed as a grid grouped by hue family (e.g. all grays together, all blues together). Each cell shows the color swatch; clicking selects that shade.

Example: element has `p-2`, spacing section shows `p-0 p-1 p-2 p-3 p-4 p-6 p-8` with `p-2` highlighted.

On hover over an option:
- Apply the change live to the clicked element's DOM node and all equivalent child nodes in other instances
- Do not queue anything yet

On click of an option:
- Lock in the selection
- Show a **Queue Change** button and a **Discard** button

On **Queue Change**:
- Build the context payload (see below)
- Send over WebSocket to MCP server
- Show confirmation: *"Change queued — say 'apply my changes' to your agent"*

On **Discard**:
- Revert all live DOM changes
- Close the picker

The picker also has an **Undo** button to revert the last applied live change.

### Context Payload

When a change is queued, the overlay sends over WebSocket:

```json
{
  "type": "CHANGE",
  "id": 1,
  "timestamp": "2025-03-12T10:23:00Z",
  "component": {
    "name": "MyButton"
  },
  "target": {
    "tag": "button",
    "classes": "bg-white text-sm rounded",
    "innerText": "Submit"
  },
  "change": {
    "property": "backgroundColor",
    "old": "bg-white",
    "new": "bg-gray-100"
  },
  "context": "<pseudo-html string>"
}
```

### Building the Pseudo-HTML Context String

Walk from the clicked element up to `<body>`, collecting the full ancestor chain. For each ancestor, also collect its immediate children so the agent sees sibling elements for disambiguation. Prune nodes that have no classes, no meaningful text, and no id — unless they are direct ancestors of the target.

The target element gets a comment marking it and the requested change. Include trimmed `innerText` (max 60 chars) as text nodes where meaningful. Include `id` attributes where present.

Example output:

```html
<body>
  <main class="min-h-screen flex flex-col">
    <footer class="fixed bottom-0 w-full bg-gray-900">
      <div class="flex items-center gap-4">
        <button class="bg-white text-sm rounded"> <!-- TARGET: change bg-white → bg-gray-100 -->
          Submit
        </button>
        <div class="text-sm text-gray-500">
          Cancel
        </div>
      </div>
    </footer>
  </main>
</body>
```

Rules:
- Always include the full ancestor chain — do not truncate it
- Include up to 3 siblings on each side of the relevant child at each ancestor level
- Collapse unrelated subtrees to `...`
- Keep the format consistently indented for readability

---

## Part 2: MCP Server

A single Node.js process. Express for HTTP, the `ws` package for WebSocket, and `@modelcontextprotocol/sdk` for MCP.

### Transport

- **Agent ↔ Server:** stdio transport. The agent host (e.g. VS Code / Copilot) spawns the server as a child process and communicates over stdin/stdout using the MCP SDK's `StdioServerTransport`.
- **Server ↔ Browser:** HTTP + WebSocket on a local port. The server starts an Express+WS listener as a side effect of launch.

### Startup

The server is started via `npx tailwind-visual-editor` (a `bin` entry in `package.json`). It can be started independently of the app. The app should be refreshed after the server is running so the overlay script tag can load.

When started by the agent host via MCP, the stdio transport is used automatically. When started standalone via `npx`, the MCP tools are still available over stdio if an agent connects later.

### Port Configuration

Default port: `3333`. Configurable via the `PORT` environment variable.

### CORS

The Express server enables CORS for all origins in dev mode (using the `cors` middleware) since the overlay is loaded cross-origin from the app's dev server. The WebSocket server accepts connections from any origin.

### Endpoints

#### `GET /overlay.js`
Serves the bundled overlay script statically.

#### `GET /tailwind-config`
Returns the resolved Tailwind theme as JSON. On startup, look for `tailwind.config.js` or `tailwind.config.ts` in the current working directory and resolve it using `tailwindcss/resolveConfig`. Extract:

- `theme.spacing` — for padding, margin, gap
- `theme.colors` — for text, bg, border colors
- `theme.fontSize`
- `theme.fontWeight`
- `theme.borderRadius`

Cache in memory. Fall back to the default Tailwind theme if no config is found.

### WebSocket Server

Accepts connections from the overlay. On message, parse JSON and handle:

- `type: "CHANGE"` — push to pending changes queue with an auto-incremented id and timestamp
- `type: "PING"` — respond with `{ type: "PONG" }`

Pending changes are stored in an in-memory array.

### MCP Tools

#### `get_pending_changes`

Returns all queued changes not yet applied.

```
No parameters.

Returns: array of change objects, each with:
  - id: number
  - timestamp: ISO string
  - component: { name }
  - target: { tag, classes, innerText }
  - change: { property, old, new }
  - context: pseudo-HTML string
```

#### `mark_changes_applied`

Marks changes as applied and removes them from the queue.

```
Parameters:
  - ids: number[]

Returns: { applied: number } — count of changes removed
```

#### `clear_pending_changes`

Discards all pending changes.

```
No parameters.
Returns: { cleared: number }
```

---

## Part 3: Agent Workflow

The agent does not run automatically. The designer triggers it by saying something like:

> *"Apply my pending style changes"*

The agent then:

1. Calls `get_pending_changes()` to retrieve the queue
2. For each change:
   - Reads the `context` pseudo-HTML to understand where the element lives in the page structure
   - Uses `component.name` to find the component file
   - Locates the className string using the context as a guide and replaces `old` class with `new`
3. Calls `mark_changes_applied(ids)` with successfully applied ids
4. Summarises what was changed and in which files

### Agent search strategy

- Search for the component name first (e.g. `MyButton`) to find the file
- Use the target's class combination as the search term within that file
- Use the ancestor chain in the pseudo-HTML to disambiguate if the same classes appear multiple times

### Notes for the agent

- The pseudo-HTML context is the primary signal — trust the ancestor structure
- Each change is always a simple class string substitution — no logic changes needed
- If genuinely ambiguous, ask the user to clarify rather than guess
- After applying, read back the changed line to confirm it looks correct
- The agent relies on its host's built-in file read/write tools (e.g. Copilot, Cursor) — the MCP server does not expose file system tools

---

## File Structure

All source is **TypeScript**. The overlay is bundled to a single IIFE JS file using **esbuild**.

```
tailwind-visual-editor/
  server/
    index.ts          # Express + WebSocket + MCP server (stdio transport)
    tailwind.ts       # resolveConfig helper
    queue.ts          # in-memory change queue
  overlay/
    src/
      index.ts        # entry — click listener, shadow DOM host, toggle
      fiber.ts        # fiber tree walking, instance finding, path matching (React 18)
      picker.ts       # floating picker UI (Floating UI for positioning)
      context.ts      # pseudo-HTML builder
      ws.ts           # WebSocket client
    dist/
      overlay.js      # esbuild IIFE bundle served by server
  package.json
  tsconfig.json
  README.md
```

---

## Error Handling

- **WebSocket disconnect:** Show a small toast in the overlay: *"Connection lost — restart the server and refresh."* Log to console. Disable the toggle button until reconnected.
- **React fiber not found:** If the clicked element has no `__reactFiber` property (e.g. non-React content), show a toast: *"Could not detect a React component for this element."* Do nothing else.
- **Tailwind config not found:** Fall back to the default Tailwind theme. Log a console warning: *"No tailwind.config found — using defaults."*
- **General errors:** Catch and display a brief toast message. Always log the full error to the browser console or server stderr.

---

## Testing Strategy

Deferred to post-MVP. After the proof of concept works end-to-end, add unit tests for the queue module, fiber walking utilities, class-prefix parsing, and pseudo-HTML builder.

---

## Future Considerations (not MVP)

- **Hardcoded vs prop-driven className detection** — the fiber tree can tell you whether a class on the clicked element came from inside the component or was passed as a prop. This could be surfaced to the agent as additional context (so it knows whether to edit the component file or a call site) or to the designer (so they understand the scope of their change). Not needed for MVP because the agent can determine this itself by reading source, and it adds complexity to the overlay.
- **React 17 support** — add `_reactRootContainer` fallback for React 17 root detection
- **Axis splitting** — allow changing `p-3` to `py-3` + `px-4` (see `axis-picker-spec.md`)
- **Separate browser window** — open the picker in a detached window for more space

---

## Key Design Decisions

- **No Babel plugin required** — the fiber tree provides component boundary detection at runtime in dev mode, which is sufficient for this tool's goals
- **Live preview is best-effort** — the path-matching approach for finding equivalent children across instances will miss edge cases with conditional or list rendering; this is acceptable because the preview is for feel, not precision
- **The agent handles correctness** — imprecision in the live preview is fine; the agent applies changes correctly by reading source
- **Tailwind scale is always respected** — the picker only shows valid values from the resolved config, so changes never introduce arbitrary values that break the design system
- **Dev-only** — the overlay script tag should never be present in production builds

 
