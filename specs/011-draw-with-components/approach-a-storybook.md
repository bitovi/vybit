# 011-A — Draw with Components: Storybook-Based Approach

## Overview

Extend the existing inline design canvas to support placing real React components from the design system onto the canvas, not just freehand sketches. This approach uses a running Storybook instance as the source of truth for which components are available, what props they accept, and how to render them.

## Motivation

The current draw workflow communicates intent via a freehand sketch. That sketch must be interpreted by an AI agent, which introduces ambiguity. When the design system already has a `<Button>`, `<Card>`, or `<Badge>` component, it is more precise to say "place a `<Button variant="primary">Save</Button>` here" than to sketch a button shape. Story files already catalog these components with prop types and default values — this approach leverages that investment directly.

## Vocabulary

| Term | Definition |
|------|-----------|
| **ComponentMeta** | Metadata for one design system component: name, story ID, argTypes, and initial args. |
| **PlacedComponent** | A component instance placed on the canvas: ComponentMeta + current prop values + position + size. |
| **ComponentPalette** | Panel UI showing available design system components with previews and a search field. |
| **PropEditor** | Panel UI for editing a placed component's props, with controls derived from argTypes. |
| **ComponentPatch** | A new patch kind (`component-design`) containing JSX code + canvas screenshot, queued for the AI agent. |
| **Story-based discovery** | Using `*.stories.tsx` files as the curated list of "design system" components — does not require Storybook to be running. |
| **Storybook static build** | Output of `storybook build`: a folder of plain HTML/JS/CSS that the MCP server can serve with `express.static`. |

---

## User Flow

```
1. User clicks element in the page
      │
      ▼
2. Panel shows existing Picker UI with "Insert Design" button
      │
      ▼
3. User clicks "Insert Design" → Insert Design popover appears
      │  └── Popover now shows two tabs: "Sketch" (existing) and "Components" (new)
      ▼
4. User clicks "Components" tab
      │  └── Panel fetches component list from Storybook (/index.json)
      ▼
5. ComponentPalette renders — grid of component cards with live previews
   (each preview is a small Storybook iframe at minimum zoom)
      │
      ▼
6. User clicks a component (e.g. Button) → PropEditor opens
      │  └── PropEditor shows controls for each argType:
      │       - enum           → <select> (e.g. variant: primary | secondary)
      │       - string         → <input type="text"> (e.g. children)
      │       - boolean        → <input type="checkbox">
      │       - number         → <input type="number">
      │       - color string   → color picker
      ▼
7. User configures props → preview iframe updates live
      │  └── Storybook iframe URL: /iframe.html?path=/story/{storyId}&args={serialized}
      ▼
8. User clicks "Place" → component is added to the canvas
      │  └── Canvas injects (as before) as sibling/child of selected element
      │  └── Placed component renders as a draggable Storybook iframe on the canvas
      ▼
9. User may place multiple components; drag/resize each independently
      │  └── Click any placed component to re-open PropEditor for that slot
      ▼
10. User clicks "Queue as Change"
      │  └── Canvas serializes all placed components to JSX
      │  └── Canvas captures screenshot (PNG)
      │  └── Sends ComponentPatch to server: { kind: 'component-design', jsx, image, context }
      ▼
11. AI agent calls implement_next_change
      │  └── Receives: JSX string + canvas screenshot + element context + insertion mode
      │  └── Instructions direct agent to insert the JSX at the target location
```

---

## Architecture

### Phase 1 — Component Metadata (no running Storybook required)

**The key insight**: `react-docgen-typescript` is what Storybook uses internally to produce argTypes from TypeScript prop interfaces. It is a transitive dependency of `@storybook/react-vite` so it is guaranteed to be in `node_modules` on any project with Storybook installed. The MCP server can call it directly using the same `createRequire` pattern already used to load the target project's `tailwindcss`:

```typescript
// server/components.ts — mirrors server/tailwind.ts exactly
import { createRequire } from 'module';
import { resolve } from 'path';
import { glob } from 'fs/promises';

async function getDocgenParser() {
  const cwd = process.cwd(); // target project dir, same as Tailwind adapter
  const req = createRequire(resolve(cwd, 'package.json'));
  // react-docgen-typescript is a dep of @storybook/react-vite — always present
  const { withDefaultConfig } = await import(req.resolve('react-docgen-typescript'));
  return withDefaultConfig({ shouldExtractLiteralValuesFromEnum: true, propFilter: { skipPropsWithoutDoc: false } });
}
```

**Discovery via story files** — rather than a full Storybook index, glob for `**/*.stories.tsx` from `process.cwd()`. Each story file's default export has a `component` field pointing to the component function; its file path resolved relative to the story file is the component source. This is the curated "design system" list without requiring Storybook to run:

```typescript
async function discoverComponents(): Promise<ComponentMeta[]> {
  const storyFiles = await glob('**/*.stories.{ts,tsx}', { cwd: process.cwd(), ignore: ['node_modules/**'] });
  const parser = await getDocgenParser();
  const results: ComponentMeta[] = [];

  for (const storyFile of storyFiles) {
    // Dynamically import the story to read its default export (Meta)
    const story = await import(path.resolve(process.cwd(), storyFile));
    const meta = story.default;
    if (!meta?.component) continue;

    const componentPath = resolveComponentPath(storyFile, meta.component);
    const docs = parser.parse(componentPath);
    if (!docs.length) continue;

    results.push({
      name: meta.component.displayName || meta.component.name,
      storyId: titleToStoryId(meta.title),
      title: meta.title,
      argTypes: docsToArgTypes(docs[0].props),
      initialArgs: meta.args ?? {},
    });
  }
  return results;
}
```

This runs at server startup (same as the Tailwind adapter initializing at boot) and the result is cached. The server exposes it via `GET /component-registry` so the panel can fetch it without polling.

**Storybook Controls argTypes are already the right shape** — no translation needed. `react-docgen-typescript` produces prop types that map 1:1 to Storybook's control configurations:

| TypeScript type | argType.control |
|---|---|
| `'primary' \| 'secondary'` (string union) | `'select'` with `options` |
| `string` | `'text'` |
| `boolean` | `'boolean'` |
| `number` | `'number'` |
| `React.ReactNode` | `'text'` (simplified to plain text for v1) |

**`ComponentMeta` type (add to `shared/types.ts`):**

```typescript
export interface ArgType {
  name: string;
  control: 'text' | 'select' | 'radio' | 'boolean' | 'number' | 'range' | 'color' | 'object';
  options?: string[];
  defaultValue?: unknown;
  required?: boolean;
  description?: string;
}

export interface ComponentMeta {
  name: string;                // e.g. "Button"
  storyId: string;             // e.g. "components-button--primary"
  title: string;               // e.g. "Components/Button"
  argTypes: Record<string, ArgType>;
  initialArgs: Record<string, unknown>;
}
```

---

### Phase 2 — Component Previews (multiple options, progressive enhancement)

Metadata (Phase 1) and previews are **separate concerns**. The ComponentPalette and PropEditor work without any preview capability. Previews are an enhancement. Several options were explored, each with different tradeoffs:

---

**Option P1 — Detect a running Storybook (zero work)**

If Storybook is already running (the user started it separately), the server detects it with a health check:

```typescript
async function detectStorybookUrl(): Promise<string | null> {
  // 1. Explicit override via environment variable (highest priority)
  if (process.env.STORYBOOK_URL) {
    return process.env.STORYBOOK_URL;
  }
  // 2. Auto-detect common ports
  for (const port of [6006, 6007]) {
    try {
      const res = await fetch(`http://localhost:${port}/index.json`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return `http://localhost:${port}`;
    } catch {}
  }
  return null;
}
```

Users can override the auto-detection by passing `STORYBOOK_URL` when starting the MCP server:

```bash
STORYBOOK_URL=http://localhost:9009 npx tsx ../server/index.ts
```

This handles non-standard ports, remote Storybook instances, and tunneled URLs (e.g. ngrok). The environment variable is documented in the server's startup log:

```
[storybook] Using STORYBOOK_URL=http://localhost:9009 (from env)
[storybook] Auto-detected at http://localhost:6006
[storybook] Not detected — falling back to static build or SSR thumbnails
```

If detected, the panel receives the Storybook URL via `GET /storybook-status` and uses it for live iframes. No build step, no process management. This is free to implement and provides the best preview quality.

*Grade: free, best quality — but only works when the user already has Storybook running.*

---

**Option P2 — Storybook static build + `express.static`**

`storybook build` produces a `storybook-static/` folder of plain HTML/JS/CSS. The MCP server serves it with `express.static` — no separate port, no process spawning:

```typescript
// server/app.ts
const storybookStaticDir = path.join(process.cwd(), 'storybook-static');
if (existsSync(storybookStaticDir)) {
  app.use('/storybook', express.static(storybookStaticDir));
  console.log('[storybook] Serving static build at /storybook');
}
```

The static build still responds to URL-driven args exactly like the dev server:
```
http://localhost:3333/storybook/iframe.html?id=components-button--primary&args=variant:secondary;children:Cancel
```

A new MCP tool `build_component_previews` triggers the build on demand:
```typescript
server.tool('build_component_previews',
  'Build Storybook static output so component previews are available in the panel. Run once after setup and again when stories change.',
  {},
  async () => {
    execSync('npx storybook build', { cwd: process.cwd(), stdio: 'inherit' });
    return { content: [{ type: 'text', text: 'Storybook static build complete. Previews available at /storybook.' }] };
  }
);
```

**⚠️ Staleness problem**: The static build snapshots CSS at build time. If this tool is used to change Tailwind classes on a component (e.g. `bg-indigo-600` → `bg-blue-500` on Button), the Storybook previews continue showing the old styles until `build_component_previews` is re-run. The running app reflects the change immediately; the preview does not.

This is an inherent limitation of the static build approach. Mitigations:
- The panel could show a "previews may be outdated" banner after any Tailwind patch is committed
- `build_component_previews` could be called automatically after a patch is marked implemented (adds ~60s to the agent loop — probably not worth it)
- **Prefer P1 (running Storybook dev) during active design sessions** — HMR keeps previews instantly current with every file save

*Grade: ~60s one-time build cost, no extra port, full prop-configurable previews, but stale after component style changes. Best for initial setup and component selection; P1 is better during active editing.*

---

**Option P3 — Server-side render thumbnails with `ReactDOMServer` (instant, no build)**

For thumbnail-only previews (the ComponentPalette grid), the MCP server can render static HTML using the target project's own React — same `createRequire` trick as the Tailwind adapter:

```typescript
async function renderComponentThumbnail(componentPath: string, componentName: string, initialArgs: Record<string, unknown>): Promise<string> {
  const req = createRequire(resolve(process.cwd(), 'package.json'));
  const { renderToStaticMarkup } = await import(req.resolve('react-dom/server'));
  const React = await import(req.resolve('react'));
  const mod = await import(componentPath);
  const Component = mod[componentName] ?? mod.default;
  return renderToStaticMarkup(React.createElement(Component, initialArgs));
}
```

Exposed as `GET /component-preview?name=Button&args={...}` → returns an HTML snippet. The panel renders it in a sandboxed `<iframe srcdoc>`.

*Grade: instant (no build), no process management, components get host-app styles. But: static HTML only — no interactivity, no live prop scrubbing. Good for thumbnails; not useful for the placed-component preview where the user adjusts props.*

---

**Option P4 — Spawn `storybook dev` on demand (not recommended)**

The server could spawn Storybook as a child process when the Components tab opens:

```typescript
spawn('npx', ['storybook', 'dev', '-p', '6007', '--no-open'], { cwd: process.cwd() })
```

**Why this is not recommended**: Storybook is not embeddable middleware — it is an opaque wrapper around a Vite dev server with no API for embedding. The cold start is 15–30 seconds as it compiles all story files. The panel would have to show a "building…" spinner and wait. Process lifecycle management (restarts, cleanup on server exit) adds significant complexity. Option P2 (static build) solves the same problem with a one-time upfront cost instead of a per-session delay.

*Grade: worst user experience of all options. Listed for completeness only.*

---

**Recommended preview strategy:**

```
Server startup:
  → Check for running Storybook at :6006/:6007 → if found, use that URL (P1) ← preferred during active editing
  → Check for storybook-static/ → if present, serve at /storybook (P2) ← good for initial setup
  → Fall back to ReactDOMServer thumbnails for palette grid (P3)
  → ComponentPalette renders without previews if all else fails

Panel shows:
  → Palette thumbnails: SSR HTML (P3) or scaled iframe (P1/P2)
  → PropEditor live preview: full iframe (P1/P2) — disabled if neither available
  → Placed components on canvas: same iframe (P1/P2) or placeholder if unavailable
  → "Previews may be outdated" banner shown after any committed patch when using P2
```

---

### Phase 3 — Component Palette & PropEditor (Panel)

Two new modlet-pattern components in `panel/src/components/`.

**`ComponentPalette/`**
- Props: `components: ComponentMeta[]`, `onSelect: (meta: ComponentMeta) => void`, `loading: boolean`, `previewBaseUrl: string | null`
- Layout: search input + grid of cards
- Each card: component name, category (from title prefix), and a thumbnail — either a scaled Storybook iframe (if P1 or P2 preview available) or an SSR `<iframe srcdoc>` from `GET /component-preview` (P3 fallback)
- Stories: loading state, populated grid, empty search result, no-preview fallback

**`PropEditor/`**

Two sub-options — both receive the same `ComponentMeta` from Phase 1 so the metadata is always available:

**Sub-option A1 — Embed Storybook Controls (zero code, requires preview)**
Embed the Storybook story iframe with addon panels visible. Storybook's native Controls panel renders prop inputs. Read back current args by parsing the iframe URL.
*Pros*: zero custom input code; JSDoc descriptions show automatically.
*Cons*: Storybook chrome, requires P1 or P2; does not work offline.

**Sub-option A2 — Custom PropEditor (recommended)**
Build a focused `PropEditor/` using `argTypes` from Phase 1. Control types map directly:

| `argType.control` | Rendered as |
|---|---|
| `'text'` | `<input type="text">` |
| `'select'` | `<select>` with `options` |
| `'radio'` | radio group with `options` |
| `'boolean'` | `<input type="checkbox">` |
| `'number'` | `<input type="number">` |
| `'range'` | `<input type="range">` |
| `'color'` | `<input type="color">` |

- Props: `meta: ComponentMeta`, `values: Record<string, unknown>`, `onChange: (key, value) => void`, `previewUrl: string | null`
- Live preview iframe updates on every prop change if `previewUrl` is set; works without any running Storybook
- Stories: Button props, Card props, empty state, no-preview fallback

---

### Phase 4 — Canvas Component Placement

Extend `panel/src/components/DesignCanvas/` to support a component placement mode alongside the existing Fabric.js freehand drawing.

**Design decisions:**
- Fabric.js is kept for the freehand/shapes layer
- Placed components are overlaid above the Fabric.js canvas as absolutely positioned `<iframe>` elements
- A "placed components" layer sits in the same container as the canvas, managed by React state
- Switching to "Select" tool in Fabric.js enables drag/resize of placed component iframes (via `mousedown` on a handle overlay)

**State shape:**
```typescript
const [placedComponents, setPlacedComponents] = useState<PlacedComponent[]>([]);
```

**Storybook iframe URL construction:**
```typescript
function storyIframeUrl(meta: ComponentMeta, props: Record<string, unknown>, storybookOrigin: string): string {
  const args = Object.entries(props)
    .map(([k, v]) => `${k}:${encodeURIComponent(String(v))}`)
    .join(';');
  // globals disables the Storybook backgrounds addon so the iframe body is transparent
  return `${storybookOrigin}/iframe.html?id=${meta.storyId}&args=${args}&viewMode=story&globals=backgrounds.grid:false;backgrounds.value:transparent`;
}
```

**Transparent iframe backgrounds:**

Storybook's backgrounds addon sets an opaque background color on the iframe `<body>` by default. For components with rounded corners (cards, badges, buttons) to render without a white box behind them, two things are required:

1. Add `&globals=backgrounds.grid:false;backgrounds.value:transparent` to the iframe URL (shown above) — this tells the Storybook backgrounds addon to use transparent
2. Set `allowTransparency="true"` and `background: transparent` on the `<iframe>` element:
   ```tsx
   <iframe
     allowTransparency={true}
     style={{ background: 'transparent', border: 'none' }}
     src={storyIframeUrl(meta, props, storybookOrigin)}
   />
   ```

Both are required together. The URL param prevents Storybook from injecting a background color; the element style prevents the browser from painting a default white iframe background.

**Drag/Resize:**
- Each placed component has a semi-transparent drag handle bar at top and resize handle at bottom-right (same pattern as existing `injectDesignCanvas` resize handles in `overlay/src/index.ts`)
- Click on a placed component → `onComponentClick(id)` → PropEditor opens for that component's current props

---

### Phase 4b — Image Capture of Placed Components

**The core problem:** Fabric.js `canvas.toDataURL()` only captures the `<canvas>` element itself. The placed Storybook `<iframe>` elements are absolutely positioned *above* the canvas in the DOM — they are not painted onto the canvas and will not appear in the exported PNG.

**Solution: same-origin `html2canvas`**

Since Option P2 (recommended) serves the Storybook static build from the MCP server at `http://localhost:3333/storybook`, all placed component iframes are **same-origin** with the panel. This means `html2canvas` can traverse into their DOM and capture them.

The `captureRegion` utility introduced in spec 012-screenshots (`overlay/src/screenshot.ts`) already wraps `html2canvas` with the right options. The panel can use a similar approach for the canvas wrapper element:

```typescript
import html2canvas from 'html2canvas';

async function captureCanvasWithComponents(wrapperEl: HTMLElement): Promise<string> {
  const canvas = await html2canvas(wrapperEl, {
    useCORS: true,
    allowTaint: false,  // only safe with same-origin iframes
    backgroundColor: null,  // preserve transparency in the composite
  });
  return canvas.toDataURL('image/png');
}
```

Called on the container `<div>` that holds both the Fabric.js `<canvas>` and the placed component `<iframe>` elements. The result is a composite PNG: freehand layer + all placed components rendered together.

**Fallback when Storybook is cross-origin (P1 — external port):**

If Storybook is running on its own port (e.g. `http://localhost:6006`), the iframes are cross-origin and `html2canvas` cannot capture them. In this case:

- The exported image shows only the Fabric.js freehand layer (iframes render as blank regions)
- The JSX string in the patch is the authoritative spec — the AI agent does not need the image to understand what was placed
- The panel shows a notice: _"Component previews are cross-origin and will not appear in the exported image. The JSX is included in the change and the agent will use it directly."_

**Export order of operations:**

```
1. Fabric.js canvas.toDataURL() is NOT used directly
2. Call html2canvas(wrapperEl) — captures Fabric layer + iframes as a composite
3. If html2canvas throws (cross-origin), fall back to canvas.toDataURL() (freehand only)
4. Send composite PNG + JSX string in the ComponentPatch
```

---

### Phase 5 — JSX Output & New Patch Kind

**JSX serialization:**

```typescript
function serializePlacedComponents(components: PlacedComponent[]): string {
  return components.map(({ meta, props }) => {
    const propsStr = Object.entries(props)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}="${v}"`;
        if (typeof v === 'boolean') return v ? k : `${k}={false}`;
        return `${k}={${JSON.stringify(v)}}`;
      })
      .join(' ');
    const children = props.children as string | undefined;
    if (children) {
      const rest = propsStr.replace(/children="[^"]*"/, '').trim();
      return `<${meta.name}${rest ? ' ' + rest : ''}>${children}</${meta.name}>`;
    }
    return `<${meta.name}${propsStr ? ' ' + propsStr : ''} />`;
  }).join('\n');
}
```

**New patch kind in `shared/types.ts`:**
```typescript
// Existing: design (freehand sketch)
// New:
export interface ComponentDesignPatch extends BasePatch {
  kind: 'component-design';
  jsx: string;                  // serialized JSX for all placed components
  image: string;                // base64 PNG screenshot of the full canvas
  componentName: string;
  context: string;
  insertMode: InsertMode;
  canvasWidth: number;
  canvasHeight: number;
}
```

**MCP tool update (`server/mcp-tools.ts`):**

`implement_next_change` already returns image + context for `design` patches. Extend the handler for `component-design`:
- Return `jsx` field prominently in the instructions
- Adjust the agent prompt: "The user has placed React components on the canvas. The JSX below represents exactly what should be inserted. Add it to the codebase at the indicated location."

---

## Relevant Files

| File | Change |
|------|--------|
| `shared/types.ts` | Add `ComponentMeta`, `PlacedComponent`, `ComponentDesignPatch`, new WS message types |
| `server/components.ts` | New — `discoverComponents()` using `react-docgen-typescript` via `createRequire` |
| `server/app.ts` | Add `GET /component-registry`, `GET /component-preview`, `GET /storybook-status`; serve `storybook-static/` at `/storybook` if present |
| `server/mcp-tools.ts` | Add `build_component_previews` tool; extend `implement_next_change` for `component-design` patches |
| `server/queue.ts` | Handle `component-design` patch kind |
| `panel/src/components/ComponentPalette/` | New modlet |
| `panel/src/components/PropEditor/` | New modlet (sub-option A2; skip if using A1 embedded Controls) |
| `panel/src/components/DesignCanvas/` | Extend with component placement mode + JSX serialization |
| `panel/src/App.tsx` | Wire ComponentPalette + PropEditor into design mode view |

---

## Test Infrastructure

### Give test-app its own Storybook

The existing `test-app` already has `Button`, `Card`, and `Badge` components — a natural small design system. Add Storybook to it:

```bash
cd test-app
npx storybook init --type react
```

Then write stories for the three existing components (`Button.stories.tsx`, `Card.stories.tsx`, `Badge.stories.tsx`) with explicit `argTypes` where the auto-inferred types need help (e.g. marking `children` as a `text` control rather than `ReactNode`):

```typescript
// test-app/src/components/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary'] },
    children: { control: 'text' },
  },
}
export default meta

export const Primary: StoryObj<typeof Button> = {
  args: { variant: 'primary', children: 'Click me' },
}
export const Secondary: StoryObj<typeof Button> = {
  args: { variant: 'secondary', children: 'Cancel' },
}
```

Repeat for `Card` and `Badge`. This gives the E2E tests a real design system with known argTypes to assert against.

**test-app Storybook port**: run on **6007** (not 6006) to avoid conflicting with the panel's own Storybook:

```bash
# test-app/package.json
"storybook": "storybook dev -p 6007"
```

Add a VS Code task `Storybook: Test App (port 6007)` alongside the existing tasks.

### Unit tests (panel/src/)

These run via Vitest and do not need a running Storybook:

- **`serializePlacedComponents`**: pure function, test with fixture `PlacedComponent[]` objects — no DOM, no iframes
- **`useComponentRegistry`** (Approach C only): mock `fetch`, assert hook state
- **`PropEditor`**: render with mock `ComponentMeta` (hardcoded argTypes fixture), assert correct input types render, fire events and assert `onChange` calls

### E2E tests (test-app/e2e/)

These run with Playwright and need server (3333) and test-app (5173). Storybook is **not** required for the baseline E2E suite — metadata comes from `react-docgen-typescript` at server startup.

Add `test-app/e2e/draw-components.spec.ts`. Core scenarios:
1. **ComponentPalette loads without Storybook** — server running, Storybook not running; open Components tab; assert Button/Card/Badge appear with SSR thumbnails
2. **ArgTypes are correct** — select Button; assert PropEditor shows a `<select>` with `primary`/`secondary` options
3. **Place and queue** — configure Button, place on canvas, click "Queue as Change"; assert queued patch has `kind: 'component-design'` and `jsx` contains `<Button`
4. **Live preview with static build** — run `build_component_previews` first; verify placed component on canvas shows a live Storybook iframe responding to prop changes

For the static-build preview tests, Storybook is a pre-built artifact (not a `webServer` entry in `playwright.config.ts` — it's just a folder the server serves statically).

### Storybook stories (panel/src/components/)

The new panel components also need their own stories for isolated development:

- `ComponentPalette.stories.tsx` — mock `ComponentMeta[]` fixture with Button/Card/Badge; test loading state, populated state, empty search
- `PropEditor.stories.tsx` — mock `ComponentMeta` with a variety of control types (select, text, boolean, color); assert controls render correctly in Storybook's visual environment

---

## Verification

1. **Metadata (no Storybook)**: Start the MCP server from `test-app/` with Storybook *not* running; call `GET /component-registry`; verify response contains Button, Card, Badge with correct argTypes (variant → select, children → text)
2. **`react-docgen-typescript` argTypes**: Unit test `discoverComponents()` against the test-app story files; verify `argTypes.variant.control === 'select'` and `argTypes.variant.options` contains `['primary', 'secondary']`
3. **SSR thumbnail (P3)**: Call `GET /component-preview?name=Button&args={"variant":"primary","children":"Click me"}`; verify response is non-empty HTML containing a `<button>` element
4. **Static build preview (P2)**: Run `build_component_previews`; verify `storybook-static/` created; navigate to `http://localhost:3333/storybook/iframe.html?id=components-button--primary`; verify it renders
5. **ComponentPalette story**: Shows Button, Card, Badge with thumbnails; graceful no-preview fallback state
6. **PropEditor story** (sub-option A2): Shows `<select>` for `variant`, `<input type="text">` for `children`; works without any Storybook running
7. **Prop change → preview update**: Change `variant` in PropEditor → preview iframe URL args update → re-renders with new variant
8. **Canvas placement E2E** (`draw-components.spec.ts`): Select element → Insert Design → Components tab → pick Button → configure → Place → verify component on canvas
9. **JSX serialization unit test**: Given `[{ meta: ButtonMeta, props: { variant: 'primary', children: 'Save' } }]`, verify output is `<Button variant="primary">Save</Button>`
10. **Full loop E2E**: Place component → Queue Change → `implement_next_change` MCP call returns `jsx` containing `<Button`
11. **No Storybook, no stories**: No `*.stories.tsx` files → Components tab shows clear "No stories found" state with setup guidance

---

## Open Questions

1. **Preview option selection**: Which preview option(s) to implement first? Recommendation: implement P3 (SSR thumbnails) first since it requires no Storybook at all, then add P2 (static build) as the path to full live prop scrubbing. P1 (detect running Storybook) is free to add alongside either.

2. **Sub-option A1 vs A2**: A1 (embed Storybook Controls) is zero PropEditor code but requires P1 or P2 preview availability. A2 (custom PropEditor) works with metadata alone. Recommendation: implement A2 first for resilience; A1 can be added as an enhanced view when previews are available.

3. **Multiple stories per component**: A component like `Button` may have `Button/Primary`, `Button/Secondary` stories. `discoverComponents()` should deduplicate by component name, using the first story's `args` as `initialArgs` and merging all stories' argTypes. The ComponentPalette shows one entry per component.

4. **`react-docgen-typescript` not installed**: If the target project has no Storybook (and therefore no `react-docgen-typescript`), the server should fall back to Approach C (MCP agent registry) or Approach B (fiber enumeration) rather than crashing. The server detects the missing dep at startup and logs a clear message.

5. **Layout wrapper**: When multiple components are placed, should the JSX output be wrapped in a layout container? Recommendation: include each component's `position` in the patch data and let the AI agent infer the appropriate layout wrapper.

6. **`storybook build` output location**: Defaults to `storybook-static/` but is configurable in `.storybook/main.ts`. The server should read the Storybook config's `outputDir` if present, rather than hardcoding the path.
