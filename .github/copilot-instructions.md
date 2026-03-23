# Tailwind Inspector MCP — Copilot Instructions

## Project Overview

A browser overlay + inspector panel + MCP server for visually editing Tailwind CSS classes on a running React app. The user clicks elements in the page, and the panel lets them scrub/select new Tailwind values which are queued as changes for an AI agent to apply.

**Stack:** TypeScript, React 18, Vite 5, Tailwind v4 (CSS-only `@theme`), Express + WebSocket, MCP SDK, Vitest, Storybook 8 + 10, esbuild.

## Key Design Tokens (Bitovi brand)

Used throughout panel UI — do not substitute generic colors:

```
bv-teal:      #00848B
bv-orange:    #F5532D
bv-surface:   panel background
bv-surface-hi: elevated surface
bv-bg:        page background
bv-border:    border color
bv-text:      primary text
bv-text-mid:  secondary text
bv-muted:     muted/disabled text
```

## Code Conventions

- **TypeScript everywhere** — no plain JS files in `overlay/`, `panel/`, or `server/`
- **No `@/` path alias** — use relative imports (`../../overlay/src/class-parser`)
- **No `cn()` utility** — use template literals for conditional classes
- **No default exports for components** — use named exports
- **React function components only** — no class components

## Running Everything

### Preferred: VS Code Tasks (run individually for full visibility)

Start each process as a separate task via **Terminal → Run Task** so you can see each terminal independently:

1. **Watch: Overlay** — esbuild `--watch`, rebuilds `overlay/dist/overlay.js` on every save
2. **Watch: Panel** — `vite build --watch`, rebuilds `panel/dist/` on every save
3. **Mock MCP Client** — spawns **its own MCP server** (port 3333) via stdio, so no separate server task is needed. Loops: `implement_next_change` → 2s simulated work → `mark_change_implemented` → repeat. Stage + commit patches in the panel and watch the mock agent pick them up.
4. **Test App (port 5173)** — Vite dev server for the test app

> **Tip:** The Mock MCP Client prints exactly what an AI agent receives from `implement_next_change`, making it easy to observe the full loop end-to-end.

### ⚠️ Mock MCP Client owns the server lifecycle

The Mock MCP Client spawns `server/index.ts` via stdio from `test-app/`, which is why the server resolves the correct `tailwindcss` package. Do not start the **Server (port 3333)** task separately when using the Mock MCP Client — only start it if you need a standalone server without the mock agent.

```bash
# If running manually (not via VS Code tasks):
# 1. Build once first
npm run build

# 2. Start the watch processes
npx esbuild overlay/src/index.ts --bundle --format=iife --outfile=overlay/dist/overlay.js --platform=browser --watch &
cd panel && npx vite build --watch &

# 3. Start the Mock MCP Client (spawns the server automatically, from test-app/)
cd test-app && npx tsx mock-mcp-client.ts
# → Server at http://localhost:3333/panel/

# 4. Start the test app
cd test-app && npx vite
# → http://localhost:5173 (page to inspect)

# 5. Storybook (optional)
cd panel && npm run storybook          # → http://localhost:6006 (panel components)
cd storybook-test/v8 && npm run storybook   # → http://localhost:6007 (test-app stories, SB8)
cd storybook-test/v10 && npm run storybook  # → http://localhost:6008 (test-app stories, SB10)
```

## Running Tests

```bash
# All panel tests (from panel/ or root)
cd panel && npm test
# or from root:
npm test

# Watch mode
cd panel && npm run test:watch

# Run specific test file
cd panel && npm test -- ScaleScrubber
```

## Package Structure

```
/                        ← root package (server + build scripts)
  server/index.ts        ← Express + WebSocket + MCP server (port 3333)
  server/tailwind.ts     ← Tailwind v4 compiler (uses target project's tailwindcss)
  server/queue.ts        ← Change queue for MCP tools
  overlay/src/           ← Browser overlay (esbuild IIFE bundle)
    class-parser.ts      ← Parses Tailwind classes → ParsedClass (shared with panel)
    index.ts             ← Shadow DOM, toggle button, click handler
    picker.ts            ← Old picker UI (being replaced by panel)
    ws.ts                ← WebSocket client
  panel/                 ← React inspector panel (separate package)
    src/App.tsx          ← Root component
    src/Picker.tsx       ← Main inspector UI (property chips, scrubbers)
    src/ws.ts            ← WebSocket client + message bus
    src/components/      ← Modlet-style components
  storybook-addon/       ← Storybook addon (SB8 + SB10 compatible)
    manager.tsx          ← Addon panel for SB8 (embeds inspector via iframe)
    manager-v10.tsx      ← Addon panel for SB10 (storybook/* imports)
    preview.ts           ← Decorator for SB8 (injects overlay.js into stories)
    preview-v10.ts       ← Decorator for SB10 (storybook/* imports)
    preset.js            ← Storybook preset hooks (auto-detects SB version)
  storybook-test/          ← Storybook integration test environments
    v8/                  ← Storybook 8 (port 6007) — stories from test-app
    v10/                 ← Storybook 10 (port 6008) — stories from test-app
  test-app/              ← Sample React app used for testing/demo
    src/components/      ← Components + story files (loaded by storybook-test/)
    e2e/                 ← Playwright E2E tests
```

## Component Architecture

Panel components follow the **modlet pattern** — self-contained folders:

```
panel/src/components/MyComponent/
  index.ts              ← re-exports
  MyComponent.tsx       ← implementation
  MyComponent.test.tsx  ← Vitest + @testing-library/react tests
  MyComponent.stories.tsx ← Storybook stories
  types.ts              ← (optional) shared types
```

See `.github/skills/create-react-modlet/SKILL.md` for full guidance.

## Naming: "change" vs "patch"

- **"change"** is the user-facing / MCP tool name: `get_next_change`, `implement_next_change`, `mark_change_implemented`, `list_changes`, `discard_all_changes`
- **"patch"** is the internal code name used in types, functions, WS messages: `Patch`, `PatchStatus`, `PATCH_UPDATE`, `addPatch`, `commitPatches`, etc.
- MCP tool names follow the `verb_subject` snake_case convention (matches GitHub MCP, Filesystem MCP)

## MCP Tool Roles

- `implement_next_change` — the **looping entry point**: waits, returns change + instructions, requires agent to loop back
- `get_next_change` — raw data only, for custom agent workflows
- `mark_change_implemented` — marks done + emits directive to call `implement_next_change` again

## Data Flow

1. User visits `http://localhost:5173` with the overlay script injected
2. Overlay registers as `'overlay'` over WebSocket to `ws://localhost:3333`
3. Panel at `http://localhost:3333/panel/` registers as `'panel'` over WebSocket
4. User clicks element → overlay sends `ELEMENT_SELECTED` message → panel renders chips
5. User scrubs/selects value → panel sends `PATCH_PREVIEW` message → overlay previews live
6. User clicks "Queue Change" → patch is staged → user commits → server stores committed patch
7. AI agent calls MCP `implement_next_change` → waits for committed patch → transitions to `implementing` → returns patch + loop instructions telling agent to implement, mark done, and call again

## `ParsedClass` Type (overlay/src/class-parser.ts)

```ts
interface ParsedClass {
  category: string;
  valueType: 'scalar' | 'enum' | 'color';  // drives which UI control renders
  prefix: string;    // e.g. "px", "text", "bg"
  value: string;     // e.g. "4", "lg", "blue-500"
  fullClass: string; // e.g. "px-4"
  themeKey: string | null; // e.g. "spacing", "colors", null
}
```

`valueType` determines the Picker UI:
- `scalar` → `ScaleScrubber` (drag-to-scrub + dropdown)
- `color` → click to expand `ColorGrid`
- `enum` → plain static chip

## Common Pitfalls

- **Server cwd**: Always start server from `test-app/` — not from the root
- **Port conflicts**: Server=3333, test-app=5173, panel SB=6006, SB8 test=6007, SB10 test=6008, panel dev=5174
- **`class-parser.ts` is shared**: Both overlay and panel import it — changes affect both
- **No `tailwind.config.js`**: Tailwind v4 uses `@theme {}` in `panel/src/index.css` only
- **`scrollIntoView` in tests**: jsdom doesn't implement it — use optional chaining `el.scrollIntoView?.()`
