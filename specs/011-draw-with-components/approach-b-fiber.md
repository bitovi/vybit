# 011-B — Draw with Components: Fiber-Based Approach

## Overview

Extend the inline design canvas to support placing React components from the host app directly onto the canvas, without requiring a separate Storybook instance. This approach discovers available components by walking the host app's React fiber tree (which the overlay already does), infers prop types from observed usage, and renders new component instances by reusing the host app's own React and module system.

## Motivation

Not every project runs Storybook. And even when Storybook is available, it only covers components that have written stories. The fiber-based approach works on any React app, surfaces components actually used in the running page, and requires no separate tooling. It is a lower-fidelity complement to the Storybook approach — prop inference is imprecise and rendering requires deeper integration — but it extends the component-draw feature to the long tail of projects that don't have Storybook.

## Vocabulary

| Term | Definition |
|------|-----------|
| **Component Registry** | A map of component types discovered by walking the fiber tree, with inferred prop metadata. |
| **InferredArgType** | A prop descriptor inferred from observed `memoizedProps` across all instances of a component. |
| **Import Mode** | An alternative to the `<script src>` script tag: the overlay is imported as an ES module, giving it access to the host app's module system and React instance. |
| **Host-Page Rendering** | Rendering a new component instance using the host app's own React/ReactDOM references, rather than an iframe. Components inherit host-app styles and context automatically. |
| **ComponentPatch** | A new patch kind (`component-design`) containing JSX code + canvas screenshot, queued for the AI agent. Shared with Approach A. |

---

## User Flow

Same as Approach A from the user's perspective. The difference is invisible at the UI layer:

- The **ComponentPalette** is populated from fiber enumeration instead of Storybook `/index.json`
- **PropEditor** controls are derived from inferred arg types instead of Storybook argTypes
- **Placed components** render in-page (using the host app's React) instead of via Storybook iframes
- **JSX output** is identical — the AI agent receives the same format regardless of discovery path

The panel detects which source is available and uses both when possible, preferring Storybook metadata when a Storybook story exists for a component found by the fiber scan.

---

## Architecture

### Phase 1 — Fiber Component Enumeration

Extend `overlay/src/fiber.ts` with a new exported function:

```typescript
export interface InferredArgType {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'unknown';
  options?: string[];          // populated when type='enum'
  observedValues: unknown[];   // all values seen across instances
}

export interface DiscoveredComponent {
  name: string;
  componentType: unknown;      // the actual function reference
  instanceCount: number;
  inferredArgTypes: Record<string, InferredArgType>;
}

const FRAMEWORK_INTERNALS = new Set([
  'StrictMode', 'Suspense', 'Fragment', 'Provider', 'Consumer',
  'ForwardRef', 'Memo', 'Portal', 'Profiler', 'Context',
  // React Router, Redux, etc. prefixes
]);

function isFrameworkComponent(name: string): boolean {
  return !name || name.startsWith('_') || FRAMEWORK_INTERNALS.has(name);
}

export function enumerateComponents(rootFiber: unknown): DiscoveredComponent[] {
  const seen = new Map<unknown, { name: string; propSets: Record<string, unknown>[] }>();

  function walk(fiber: unknown): void {
    if (!fiber) return;
    const f = fiber as any;
    if (typeof f.type === 'function') {
      const name = f.type.displayName || f.type.name || '';
      if (!isFrameworkComponent(name)) {
        if (!seen.has(f.type)) seen.set(f.type, { name, propSets: [] });
        if (f.memoizedProps) seen.get(f.type)!.propSets.push(f.memoizedProps);
      }
    }
    walk(f.child);
    walk(f.sibling);
  }

  walk(rootFiber);

  return Array.from(seen.entries()).map(([type, { name, propSets }]) => ({
    name,
    componentType: type,
    instanceCount: propSets.length,
    inferredArgTypes: inferArgTypes(propSets),
  }));
}
```

**Prop type inference:**

```typescript
function inferArgTypes(propSets: Record<string, unknown>[]): Record<string, InferredArgType> {
  if (propSets.length === 0) return {};

  const keys = new Set(propSets.flatMap(p => Object.keys(p)).filter(k => k !== 'children' || true));
  const result: Record<string, InferredArgType> = {};

  for (const key of keys) {
    const observedValues = propSets
      .map(p => p[key])
      .filter(v => v !== undefined && v !== null);

    if (observedValues.length === 0) continue;

    const uniqueValues = [...new Set(observedValues.map(v => JSON.stringify(v)))].map(s => JSON.parse(s));
    const jsTypes = new Set(uniqueValues.map(v => typeof v));

    if (jsTypes.size === 1) {
      const jsType = [...jsTypes][0];
      if (jsType === 'boolean') {
        result[key] = { name: key, type: 'boolean', observedValues };
      } else if (jsType === 'number') {
        result[key] = { name: key, type: 'number', observedValues };
      } else if (jsType === 'string') {
        // Small unique set → treat as enum
        if (uniqueValues.length <= 8 && uniqueValues.every(v => typeof v === 'string')) {
          result[key] = { name: key, type: 'enum', options: uniqueValues as string[], observedValues };
        } else {
          result[key] = { name: key, type: 'string', observedValues };
        }
      } else {
        result[key] = { name: key, type: 'unknown', observedValues };
      }
    } else {
      result[key] = { name: key, type: 'unknown', observedValues };
    }
  }

  return result;
}
```

**WebSocket message from overlay to panel:**

```typescript
// In shared/types.ts
export interface ComponentRegistryMessage {
  type: 'COMPONENT_REGISTRY';
  to: 'panel';
  components: DiscoveredComponent[];
}
```

The overlay sends `COMPONENT_REGISTRY` once on initial connection and again whenever `REFRESH_COMPONENT_REGISTRY` is received from the panel (e.g. after a hot reload).

---

### Phase 2 — PropEditor from Inferred Types

The `PropEditor` component from Approach A works identically here — it accepts an argTypes-like descriptor and renders controls. The only difference is the source of truth:

- **Approach A**: argTypes come from Storybook's TypeScript reflection (authoritative)
- **Approach B**: argTypes come from `inferredArgTypes` (best-effort, may miss props not observed in current page state)

To bridge the two, define a shared `NormalizedArgType` interface that both sources map to:

```typescript
// shared/types.ts
export interface NormalizedArgType {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'unknown';
  options?: string[];
  defaultValue?: unknown;
  source: 'storybook' | 'inferred';
}
```

Both `ArgType` (Storybook) and `InferredArgType` (fiber) are mapped to `NormalizedArgType` before being passed to `PropEditor`. This keeps `PropEditor` source-agnostic.

---

### Phase 3 — Host-Page Rendering

Instead of Storybook iframes, placed components render directly in the host page using the host app's React.

**Strategy: Import Mode (preferred)**

Change the overlay from a `<script src>` tag to an ES module import. The overlay then shares the same JavaScript module graph as the host app, giving it access to `import()` and the host app's React singleton.

Users update their entry point:

```tsx
// Before (script tag in index.html):
// <script src="http://localhost:3333/overlay.js"></script>

// After (in main.tsx or App.tsx):
import { initOverlay } from 'http://localhost:3333/overlay.esm.js';

initOverlay({ serverUrl: 'http://localhost:3333' });
```

Or with explicit component registration (most reliable path to host-page rendering):

```tsx
import { initOverlay, registerComponents } from 'http://localhost:3333/overlay.esm.js';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Badge } from './components/Badge';

registerComponents({ Button, Card, Badge });
initOverlay({ serverUrl: 'http://localhost:3333' });
```

When `registerComponents` is called, the overlay has direct references to the component functions and the host app's React (since they're in the same module graph). New instances can be rendered with:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';

function renderComponentInstance(
  container: HTMLElement,
  componentType: React.ComponentType<any>,
  props: Record<string, unknown>
): void {
  ReactDOM.createRoot(container).render(React.createElement(componentType, props));
}
```

**Strategy: Fiber-Extracted React (fallback)**

If the overlay is still loaded as a script tag, it cannot directly import React. However, React exposes itself on fiber internals. The overlay can extract React and ReactDOM references:

```typescript
function getHostReact(): { React: any; ReactDOM: any } | null {
  // React is accessible via any fiber's _owner or via any rendered hook state
  const rootFiber = getRootFiber();
  if (!rootFiber) return null;

  // Walk fibers to find a component that used useState/useEffect
  // The dispatcher is stored as ReactSharedInternals (React 18+)
  const sharedInternals = (rootFiber as any)?.stateNode?.current?.updateQueue;
  // ...complex and React-version-dependent; not recommended for production
  return null;
}
```

This fallback is fragile and React-version-dependent. It is included as a last resort. The recommended path is import mode or explicit `registerComponents`.

**Strategy: Global Window (simplest fallback)**

Some apps expose React on `window.React` (common with UMD builds or CDN React). Check first:

```typescript
const HostReact = (window as any).React;
const HostReactDOM = (window as any).ReactDOM;
```

This is too narrow for modern bundled apps and is mentioned only for completeness.

---

### Phase 4 — Import Mode Implementation

**New build output: `overlay/dist/overlay.esm.js`**

Add a second esbuild target alongside the existing IIFE:

```bash
npx esbuild overlay/src/module.ts \
  --bundle \
  --format=esm \
  --outfile=overlay/dist/overlay.esm.js \
  --platform=browser \
  --external:react \
  --external:react-dom
```

The `--external:react` and `--external:react-dom` flags tell esbuild NOT to bundle React — the host app's React is used instead. This is critical to avoid duplicate React instances, which break hooks.

**New entry point: `overlay/src/module.ts`**

```typescript
import { init as initIIFE } from './index';

export interface OverlayOptions {
  serverUrl?: string;
}

export function initOverlay(options?: OverlayOptions): void {
  initIIFE(options);
}

const registeredComponents = new Map<string, React.ComponentType<any>>();

export function registerComponents(components: Record<string, React.ComponentType<any>>): void {
  for (const [name, type] of Object.entries(components)) {
    registeredComponents.set(name, type);
  }
  // Notify the overlay so it can merge with fiber-discovered components
  window.dispatchEvent(new CustomEvent('tw-inspector:components-registered', {
    detail: { components: Object.fromEntries(registeredComponents) }
  }));
}

export { registeredComponents };
```

**Server: serve ESM bundle**

In `server/app.ts`, add alongside the existing `/overlay.js` route:

```typescript
app.get('/overlay.esm.js', (_req, res) => {
  const esmPath = path.join(packageRoot, 'overlay', 'dist', 'overlay.esm.js');
  res.sendFile(esmPath);
});
```

---

## Relevant Files

| File | Change |
|------|--------|
| `overlay/src/fiber.ts` | Add `enumerateComponents()`, `inferArgTypes()`, `InferredArgType`, `DiscoveredComponent` |
| `overlay/src/index.ts` | Send `COMPONENT_REGISTRY` on connect; handle `REFRESH_COMPONENT_REGISTRY`; handle `tw-inspector:components-registered` event |
| `overlay/src/module.ts` | New ESM entry point with `initOverlay()` and `registerComponents()` |
| `shared/types.ts` | Add `ComponentRegistryMessage`, `NormalizedArgType`, `PlacedComponent`, `ComponentDesignPatch` |
| `panel/src/components/ComponentPalette/` | New modlet — same as Approach A but populated from `COMPONENT_REGISTRY` message |
| `panel/src/components/PropEditor/` | New modlet — same as Approach A but accepts `NormalizedArgType[]` |
| `panel/src/components/DesignCanvas/` | Extend with component placement mode (host-page rendering instead of Storybook iframes) |
| `server/app.ts` | Add `GET /overlay.esm.js` route |
| `server/queue.ts` | Handle `component-design` patch kind (shared with Approach A) |
| `server/mcp-tools.ts` | Return JSX in `implement_next_change` for `component-design` patches (shared with Approach A) |
| `package.json` (root) | Add second esbuild command for ESM output |

---

## Key Limitation: Only Sees What Is Currently Rendered

**Approach B can only discover components that are mounted in the React fiber tree at the moment of enumeration.** If `<Slider>`, `<Modal>`, or `<DatePicker>` exist in the design system but are not rendered on the current page, they will not appear in the ComponentPalette. There is no way to enumerate components from source files or `node_modules` without a build-tool integration.

This is the fundamental difference from Approach A: Storybook is an explicit, curated catalog of "these are the design system components you should use." The fiber approach is a best-effort snapshot of "these are the components visible right now."

Practical consequences:
- Components only shown conditionally (modals, tooltips, empty states) will be missing unless their containing route/state is active
- Components imported but never rendered (e.g. a new component added but not yet placed in the app) are invisible
- The registry will change as the user navigates between pages

A partial mitigation: the overlay could watch for React renders and incrementally add newly mounted component types to the registry over the session lifetime. But this only helps for components that happen to render during the session — it does not solve the fundamental catalog-completeness problem.

**Bottom line**: Approach B is best thought of as a "quick-start, zero-config" path for apps that don't have Storybook, not as a replacement for a proper component catalog. For a complete design system palette, Approach A (Storybook) is the right answer.

---

## Tradeoffs vs. Approach A

| | Approach A (Storybook) | Approach B (Fiber) |
|---|---|---|
| **Requires Storybook** | Yes | No |
| **Component catalog completeness** | Complete (every story = one entry) | Partial (only components on current page) |
| **Prop metadata quality** | High (TypeScript reflection) | Medium (inferred from usage) |
| **Discovers undocumented components** | No (must have stories) | Yes (any component in the fiber tree) |
| **Rendering isolation** | High (Storybook iframe) | None (renders in page, full context) |
| **Build integration needed** | No (Storybook already set up) | Optional (import mode) or Yes (explicit `registerComponents`) |
| **Fragility** | Low | Medium (fiber extraction) to Low (import mode) |
| **Missing props** | Never (TypeScript knows all) | Possible (only props seen in current page) |

---

## Verification

1. **`enumerateComponents` unit test**: Mock a fiber tree with Button (2 instances), Card (3 instances), and a React.Fragment; verify output contains Button and Card but not Fragment
2. **`inferArgTypes` unit test**: Given `[{ variant: 'primary' }, { variant: 'secondary' }, { variant: 'primary' }]`, verify output `variant: { type: 'enum', options: ['primary', 'secondary'] }`
3. **`COMPONENT_REGISTRY` message E2E**: Load test-app; verify panel receives `COMPONENT_REGISTRY` with Button, Card, Badge entries
4. **Import mode smoke test**: Replace script tag with ESM import in test-app; verify overlay still loads and connects to server
5. **`registerComponents` rendering**: Call `registerComponents({ Button })`; place Button on canvas; verify it renders in the host page with host-app styles
6. **`NormalizedArgType` mapping**: Unit test that both Storybook `ArgType` and `InferredArgType` map correctly to `NormalizedArgType`
7. **JSX output**: Same as Approach A — given placed components, verify serialized JSX matches expected output

---

## Open Questions

1. **React version compatibility**: The fiber key format (`__reactFiber$`) and `memoizedProps` field name are stable since React 16 but not guaranteed. A version detection guard should be added to `enumerateComponents` similar to the one already used in `getFiber`.

2. **Hot reload**: When Vite hot-reloads a module, component function references change and the fiber registry goes stale (old function !== new function). The overlay should listen for Vite's `vite:afterUpdate` custom event and re-enumerate on hot reload.

3. **Import mode backwards compatibility**: The existing script tag approach must continue to work unchanged. The ESM entry point is strictly additive — apps using `<script src>` lose nothing.

4. **Duplicate React**: If the overlay ESM bundle were to bundle its own React (not using `--external`), hooks would break due to two React instances. The esbuild `--external:react` flag is essential and must be documented prominently.

5. **PropEditor for `children` props**: The `children` prop is a `ReactNode`, which cannot be described by a simple `InferredArgType`. Recommend rendering it as a `<textarea>` that accepts plain text or a simple JSX string, which the serializer then embeds literally.
