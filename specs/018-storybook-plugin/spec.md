# 018 — Storybook Addon

## Overview

A first-class Storybook addon that embeds Vybit inside Storybook's UI. Designers can click elements in the story canvas, inspect and change Tailwind classes in the inspector panel, and queue changes for the AI agent — all without leaving Storybook.

The overlay is injected into Storybook's story iframe. The inspector panel appears as a native addon panel on the right side of the canvas. The agent runs alongside Storybook and picks up queued changes normally via `implement_next_change`.

This spec covers **Phase 1: Tailwind class editing inside Storybook**. The component palette (spec 011-A) is a separate, independent track — see "Non-Goals" below.

---

## Motivation

Today, using the inspector with Storybook requires a two-window workflow:

1. Open the test app (or inject the overlay into Storybook via `preview-head.html`)
2. Open `http://localhost:3333/panel` in a separate window

This is awkward. Designers who live in Storybook have to context-switch constantly. A proper addon makes the inspector a native part of the Storybook experience — one window, two config lines in `.storybook/main.ts`.

---

## Goals

- Overlay appears automatically in every story canvas — no per-story code
- Inspector panel appears as a right-side addon panel in Storybook's chrome
- Full end-to-end flow works: click element → edit classes → queue change → agent implements
- Story navigation resets the panel's element selection (no stale selection across stories)
- Single `addons: [...]` config line is the entire user-facing setup
- Works with Storybook 8 and Tailwind v4 (and v3 via the existing adapter)

---

## Installation & Setup

### Why a local install is required

Storybook's addon panel registration (`addons.register`, `addons.add`) works through its module bundler at build time — the `preset.ts` → `managerEntries()` pipeline tells Storybook to include manager code in its bundle. The `addons` API is **not** a window global; there is no way to call it from a `<script>` tag injected at runtime via `managerHead`. Registering the panel tab therefore requires the package to be in `node_modules`.

However, the locally-installed code is **minimal wiring only**. It tells Storybook where to find the preview and manager entry points. The actual behavior — the overlay script and the inspector panel UI — both come from the running MCP server at port 3333. The installed package is essentially a stub that points at the server.

### Setup steps

**1. Install the package**

```bash
npm install -D @bitovi/vybit
```

**2. Configure `.storybook/main.ts`**

```ts
export default {
  addons: [
    // ... other addons
    '@bitovi/vybit/storybook-addon',
  ],
};
```

That's it. The MCP agent config already handles starting the server:

```json
{
  "mcpServers": {
    "vybit": {
      "command": "npx",
      "args": ["@bitovi/vybit"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

The `npx` invocation starts the server when the agent connects. The locally-installed package is only used by Storybook's build process to register the addon — both coexist without conflict.

**Optional: non-default server port**

```ts
// .storybook/preview.ts
export const parameters = {
  vybit: {
    serverUrl: 'http://localhost:4000',  // only needed if running vybit on a non-default port
  },
};
```

---

## Package Distribution

The addon is exported from the existing `@bitovi/vybit` package at the subpath `@bitovi/vybit/storybook-addon`. This requires two changes to the root `package.json`:

**Add `storybook-addon/` to `files`:**
```json
"files": [
  "loader.mjs",
  "server/",
  "overlay/dist/",
  "panel/dist/",
  "shared/",
  "storybook-addon/"
]
```

**Add a package export for the addon preset:**
```json
"exports": {
  ".": "./loader.mjs",
  "./storybook-addon": "./storybook-addon/index.js"
}
```

The `storybook-addon/index.js` re-exports the compiled `preset.ts`. Storybook's addon resolution finds it via the `storybook-addon` export key.

**What the installed package contains**: only the wiring (`preset.ts`, `preview.ts`, `manager.tsx`). No overlay logic, no panel UI, no WebSocket code. All real functionality is served from the running server at port 3333.

## Non-Goals

- Component palette / "draw with components" — that feature is spec 011-A; it lives in the app inspector and uses Storybook only as a data source, independent of this addon
- Publishing to npm — internal to this repo for now; structured for easy extraction later
- Support for Storybook versions older than 7
- Storybook static builds (the addon requires a running MCP server)

---

## Vocabulary

| Term | Definition |
|------|-----------|
| **Storybook addon** | A package that Storybook loads automatically when listed in `addons`. Has two entry points: `preview` (runs in the story iframe) and `manager` (runs in the Storybook shell). |
| **preview.ts** | Addon entry point that runs inside the story iframe. Has direct DOM access to story content. Responsible for injecting the overlay script. |
| **manager.tsx** | Addon entry point that runs in the Storybook shell (manager window). Responsible for registering the inspector panel tab. |
| **preset.ts** | Storybook's auto-registration mechanism. Tells Storybook which files are `preview` and `manager` entries. Executes at build time — not in the browser. |
| **Storybook channel** | A built-in cross-iframe message bus between manager and preview. Used here to forward `STORY_RENDERED` events so the panel can reset selection on story navigation. |
| **AddonPanel** | Storybook's `@storybook/components` wrapper for right-side panels. The inspector panel iframe is rendered inside one. |
| **serverUrl** | The base URL of the running MCP server. Defaults to `http://localhost:3333`. Configurable via Storybook parameters so teams with a non-default port don't need to modify source. |

---

## User Flow

```
One-time setup:

1. Add to .storybook/main.ts:
      addons: ['../storybook-addon']   ← or npm package name once published
   (Optional) Add to .storybook/preview.ts:
      export const parameters = {
        vybit: { serverUrl: 'http://localhost:3333' }
      }
      │
      ▼
2. Start the MCP server + Storybook:
      cd test-app && npx tsx watch ../server/index.ts
      cd panel && npm run storybook


Runtime:

3. Designer opens Storybook (port 6006)
      │  └── preset.ts has told Storybook to load preview.ts + manager.tsx
      ▼
4. Story loads in the canvas iframe
      │  └── preview.ts runs inside the iframe
      │  └── Injects <script src="http://localhost:3333/overlay.js"> once
      │  └── Overlay boots: shadow host, toggle button, WS connects to ws://localhost:3333
      ▼
5. "Vybit" panel tab appears on the right side of the canvas
      │  └── manager.tsx has registered an AddonPanel
      │  └── Panel renders as <iframe src="http://localhost:3333/panel/">
      │  └── Panel iframe registers as 'panel' over WS → receives QUEUE_UPDATE
      ▼
6. Designer clicks the overlay toggle button to enter click-to-inspect mode
      ▼
7. Designer clicks an element in the story canvas
      │  └── Overlay sends ELEMENT_SELECTED to panel over WebSocket
      │  └── Panel renders class chips for the selected element
      ▼
8. Designer scrubs a spacing value in the panel
      │  └── Panel sends PATCH_PREVIEW to overlay → live DOM update in story canvas
      ▼
9. Designer clicks "Queue Change"
      │  └── Panel sends PATCH_STAGE to overlay
      │  └── Overlay fills context (component name, HTML, pageUrl = Storybook URL)
      │  └── Overlay sends PATCH_STAGED to server → draft queue updated
      ▼
10. Designer commits the draft
       │  └── Agent calls implement_next_change → receives change + instructions
       │  └── Agent edits source file → class update propagates on next story reload
       ▼
11. Designer navigates to a different story
       │  └── preview.ts receives STORY_RENDERED channel event
       │  └── Posts STORYBOOK_STORY_RENDERED to overlay window
       │  └── Overlay sends RESET_SELECTION to server over WS
       │  └── Server broadcasts RESET_SELECTION → panel clears element selection
       │  └── Staged/committed queue is preserved — changes are not story-scoped
```

---

## Architecture

### Package structure

```
storybook-addon/
  package.json        ← peer deps: @storybook/manager-api, @storybook/preview-api
  preset.ts           ← Storybook auto-registration (runs at build time, not in browser)
  preview.ts          ← Runs inside story iframe: overlay injection + story-change events
  manager.tsx         ← Runs in Storybook shell: registers the inspector panel tab
  index.ts            ← Re-exports preset (Storybook entry point)
```

### `preset.ts`

Storybook's recommended auto-registration pattern. Called at build time to discover entry points:

```ts
export function previewAnnotations(entry: string[] = []) {
  return [...entry, require.resolve('./preview')];
}
export function managerEntries(entry: string[] = []) {
  return [...entry, require.resolve('./manager')];
}
```

### `preview.ts`

Runs inside the story iframe. Has full DOM access to story content.

Responsibilities:
- Read `serverUrl` from Storybook parameters (default: `http://localhost:3333`)
- Inject `<script src="{serverUrl}/overlay.js">` once — guard against double-injection with a flag
- On `STORY_RENDERED` channel event: post `STORYBOOK_STORY_RENDERED` to `window` so overlay can send `RESET_SELECTION` over its existing WS connection

```ts
import { addons } from '@storybook/preview-api';

let injected = false;

export const decorators = [
  (StoryFn: any, context: any) => {
    const serverUrl =
      context.parameters?.vybit?.serverUrl ?? 'http://localhost:3333';

    if (!injected) {
      const script = document.createElement('script');
      script.src = `${serverUrl}/overlay.js`;
      document.head.appendChild(script);
      injected = true;
    }

    return StoryFn();
  },
];

const channel = addons.getChannel();
channel.on('storyRendered', () => {
  window.postMessage({ type: 'STORYBOOK_STORY_RENDERED' }, '*');
});
```

### `manager.tsx`

Runs in Storybook's manager (shell) window. Registers the inspector panel.

```tsx
import { addons, types } from '@storybook/manager-api';
import { AddonPanel } from '@storybook/components';

const ADDON_ID = 'vybit';
const PANEL_ID = `${ADDON_ID}/panel`;

addons.register(ADDON_ID, (api) => {
  const serverUrl =
    api.getCurrentParameter<{ serverUrl?: string }>('vybit')?.serverUrl
    ?? 'http://localhost:3333';

  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'Vybit',
    paramKey: 'vybit',
    render: ({ active }) => (
      <AddonPanel active={active ?? false}>
        <iframe
          src={`${serverUrl}/panel/`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Vybit Panel"
        />
      </AddonPanel>
    ),
  });
});
```

### Panel iframe — rationale

The panel renders as `<iframe src="http://localhost:3333/panel/">` rather than as native React components. This is intentional for Phase 1:

- Panel is served from port 3333, so `window.location.origin` resolves correctly →  `panel/src/ws.ts` requires **zero changes**
- Tailwind `@theme` CSS variables in `panel/src/index.css` are fully active inside the iframe's document — no CSS isolation problem
- No cross-window React context issues

The tradeoff is two origins (manager at 6006, panel at 3333). This is acceptable for Phase 1. If tighter integration is needed later, native component embedding can replace the iframe — but it requires making the WS URL configurable and solving CSS isolation.

### Panel position: right side

Storybook's default panel position is the bottom strip. The inspector should default to the **right side**. The chip-heavy inspector UI needs vertical space; a right-side panel is closer to browser DevTools — familiar and practical for designers.

Storybook 8 allows panels to declare a preferred position. Investigate `types.PANEL` options in `@storybook/manager-api` during implementation; if no API exists, document that users can drag the panel to the right themselves.

### Overlay: handling two concurrent connections

When the Storybook canvas (port 6006) and the test-app (port 5173) are both open, the MCP server has two registered overlay WS clients. The server currently broadcasts `PATCH_PREVIEW` to all overlays — both pages will show the preview, which is benign. Routing patches to a specific overlay by `pageUrl` is a future improvement, not required for Phase 1.

---

## New WebSocket Message

Add to `shared/types.ts`:

```ts
// Overlay → server (no "to" field — server handles directly)
// Server broadcasts result to all panel clients
interface ResetSelectionMessage {
  type: 'RESET_SELECTION';
}
```

**Overlay** (`overlay/src/ws.ts`): listen for `window.message` of type `STORYBOOK_STORY_RENDERED`, then send `{ type: 'RESET_SELECTION' }` over the overlay's existing WS.

**Server** (`server/websocket.ts`): on receiving `RESET_SELECTION` from an overlay client, broadcast `{ type: 'RESET_SELECTION', to: 'panel' }` to all panel clients.

**Panel** (`panel/src/ws.ts`): on receiving `RESET_SELECTION`, clear the currently selected element from state.

---

## Configuration Reference

Complete user-facing setup. All fields are optional — defaults work for the standard port 3333 setup:

```ts
// .storybook/main.ts
export default {
  addons: ['../storybook-addon'],  // or '@bitovi/vybit/storybook-addon' once published
};

// .storybook/preview.ts  (only needed for non-default server port)
export const parameters = {
  vybit: {
    serverUrl: 'http://localhost:3333',  // default
  },
};
```

---

## Implementation Steps

1. **Create `storybook-addon/` package** — `package.json`, `preset.ts`, `preview.ts`, `manager.tsx`, `index.ts`
2. **Add `RESET_SELECTION` handling**
   - `shared/types.ts` — add message type
   - `overlay/src/ws.ts` — listen for `STORYBOOK_STORY_RENDERED` window message, send `RESET_SELECTION` over WS
   - `server/websocket.ts` — on receipt from overlay, broadcast to all panel clients
   - `panel/src/ws.ts` — on receipt, clear selected element state
3. **Wire addon into test-app Storybook** — add to `test-app/.storybook/main.ts` (port 6007) for end-to-end verification
4. **Verify end-to-end** — click element in story canvas → edit Tailwind class → queue change → confirm mock MCP client picks it up → navigate to different story → confirm panel clears

---

## Open Questions

- **Right-side panel positioning**: Storybook 8's API for default panel position is not well documented. May need to default to bottom and instruct users to drag right manually. Investigate during Step 1.
- **Overlay auto-activate**: Should the overlay auto-enter click-to-inspect mode when a designer opens the inspector panel tab? Would feel more native than requiring a click on the toggle button first.
- **CSP**: Projects with a strict Content Security Policy on Storybook may block `script-src localhost:3333`. The addon README should document the required exemption.
- **HMR vs. story navigation**: `STORY_RENDERED` fires on every Vite HMR update, not just true story navigations, so selection resets on every hot reload. Consider checking whether the story ID changed before resetting, to avoid clearing selection while a designer is mid-edit.
