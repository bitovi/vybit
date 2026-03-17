# 011-C — Draw with Components: MCP-Agent Registry Approach

## Overview

Use the AI agent (via new MCP tools) to statically analyze the host app's codebase and produce a JSON registry of all design system components with their props, default values, and dynamic import paths. The overlay then uses those import paths to load and render the components at runtime.

This approach combines the best of the other two:
- Like **Approach A (Storybook)**: sees the complete component catalog, not just what's on the current page
- Like **Approach B (Fiber import mode)**: renders components natively in the host app, no Storybook required
- Unlike both: requires no Storybook setup and no components to be currently rendered — the AI reads source files directly

---

## Motivation

The AI agent already has full read access to the project's source files via the Filesystem MCP. It can read TypeScript interfaces, extract prop types and default values, and identify which files export React components — tasks it handles well. Asking it to produce a component registry is a natural extension of its existing role.

From the user's perspective, the setup cost is a single MCP tool call: `build_component_registry`. The agent does the work, writes a `component-registry.json` to the project, and the panel picks it up. From that point the experience is identical to Approach A — a ComponentPalette with complete prop editors.

---

## Vocabulary

| Term | Definition |
|------|-----------|
| **Component Registry** | A JSON file (`component-registry.json`) listing all design system components, their props, and their import paths. Written by the AI agent, consumed by the panel. |
| **`build_component_registry` MCP tool** | A new MCP tool that instructs the agent to scan the codebase and produce the registry. |
| **`get_component_registry` MCP tool** | A new MCP tool that returns the current registry to the panel (so the panel doesn't need direct filesystem access). |
| **Dynamic Import Path** | The ES module path the overlay uses to `import()` a component at runtime: e.g. `./src/components/Button.tsx`. |
| **Import Mode** | The overlay loaded as an ES module (see Approach B, Phase 4), giving it access to `import()`. Required for host-page rendering. |

---

## User Flow

```
One-time setup (run once per project, re-run when component library changes):

1. AI agent (or user manually) calls build_component_registry MCP tool
      │  └── Agent scans src/ for React component exports
      │  └── Agent reads TypeScript prop interfaces via static analysis
      │  └── Agent writes component-registry.json to project root
      ▼
2. Registry is available — panel reads it via get_component_registry tool
      │  (or panel fetches GET /component-registry from the MCP server)
      ▼

Runtime (same as Approach A from here):

3. User clicks element → panel shows "Insert Design" → "Components" tab
      │  └── ComponentPalette is populated from component-registry.json
      ▼
4. User selects a component → PropEditor shows controls from registry argTypes
      ▼
5. User configures props → placed component renders via dynamic import
      │  └── overlay: const { Button } = await import('./src/components/Button')
      │  └── ReactDOM.createRoot(container).render(<Button {...props} />)
      ▼
6. User queues change → JSX serialized → ComponentPatch sent to AI agent
      ▼
7. implement_next_change returns JSX + insertion context to agent
```

---

## Architecture

### New MCP Tools

**`build_component_registry`**

Instructs the agent to scan the project and write `component-registry.json`.

```typescript
// server/mcp-tools.ts

server.tool(
  'build_component_registry',
  'Scan the project source files and build a JSON registry of all design system components with their props and import paths. Write the result to component-registry.json in the project root. Call this once per project setup and again after significant component library changes.',
  {
    componentDirs: z.array(z.string()).optional().describe(
      'Directories to scan for components. Defaults to ["src/components", "src/ui", "components", "lib/components"].'
    ),
    outputPath: z.string().optional().describe(
      'Output file path relative to project root. Defaults to "component-registry.json".'
    ),
  },
  async ({ componentDirs, outputPath }) => {
    // This tool body is intentionally minimal — it returns instructions to the agent.
    // The agent performs the actual file scanning and writing.
    const dirs = componentDirs ?? ['src/components', 'src/ui', 'components', 'lib/components'];
    const out = outputPath ?? 'component-registry.json';
    return {
      content: [{
        type: 'text',
        text: [
          `Scan the following directories for React component files: ${dirs.join(', ')}`,
          '',
          'For each exported React component, extract:',
          '  1. componentName: the exported identifier (e.g. "Button")',
          '  2. importPath: the file path relative to the project root (e.g. "src/components/Button.tsx")',
          '  3. argTypes: an object keyed by prop name, each entry containing:',
          '       - type: "string" | "number" | "boolean" | "enum" | "color" | "unknown"',
          '       - options: string[] (for enum type only)',
          '       - defaultValue: the default value if specified in the interface or defaultProps',
          '       - required: boolean',
          '  4. description: optional JSDoc comment on the component or its props interface',
          '',
          'Exclude: internal/private components (prefixed with _), HOCs, Context providers,',
          'hooks, utility functions, and components with no props interface.',
          '',
          `Write the result as valid JSON to ${out}. Format:`,
          JSON.stringify({
            version: 1,
            generatedAt: '<ISO timestamp>',
            components: [
              {
                componentName: 'Button',
                importPath: 'src/components/Button.tsx',
                description: 'Primary action button with variant support.',
                argTypes: {
                  variant: { type: 'enum', options: ['primary', 'secondary'], required: true },
                  children: { type: 'string', required: false },
                  disabled: { type: 'boolean', defaultValue: false, required: false }
                }
              }
            ]
          }, null, 2),
          '',
          `After writing the file, call notify_registry_updated to tell the panel to reload.`,
        ].join('\n'),
      }],
    };
  }
);
```

**`notify_registry_updated`**

Called by the agent after writing the registry file. The server broadcasts a WebSocket message to all connected panels so they reload the component list without a page refresh.

```typescript
server.tool(
  'notify_registry_updated',
  'Notify the panel that the component registry has been updated and should be reloaded.',
  {},
  async () => {
    broadcast({ type: 'COMPONENT_REGISTRY_UPDATED', to: 'panel' });
    return { content: [{ type: 'text', text: 'Panel notified.' }] };
  }
);
```

**`get_component_registry`**

Returns the current registry. Primarily for the agent's own use (e.g. when constructing JSX output, it can look up exact prop types).

```typescript
server.tool(
  'get_component_registry',
  'Return the current component registry JSON. Use this to look up component prop types when implementing changes.',
  {},
  async () => {
    const registryPath = path.join(process.cwd(), 'component-registry.json');
    try {
      const content = await fs.readFile(registryPath, 'utf8');
      return { content: [{ type: 'text', text: content }] };
    } catch {
      return { content: [{ type: 'text', text: 'No component registry found. Call build_component_registry first.' }] };
    }
  }
);
```

---

### Registry File Format

`component-registry.json` lives in the project root (next to `package.json`). The server watches it for changes and re-broadcasts `COMPONENT_REGISTRY_UPDATED` when it changes on disk (handles manual edits and re-runs of `build_component_registry`).

```json
{
  "version": 1,
  "generatedAt": "2026-03-17T12:00:00Z",
  "components": [
    {
      "componentName": "Button",
      "importPath": "src/components/Button.tsx",
      "description": "Primary action button with variant support.",
      "argTypes": {
        "variant": {
          "type": "enum",
          "options": ["primary", "secondary"],
          "required": true
        },
        "children": {
          "type": "string",
          "required": false
        },
        "disabled": {
          "type": "boolean",
          "defaultValue": false,
          "required": false
        }
      }
    },
    {
      "componentName": "Card",
      "importPath": "src/components/Card.tsx",
      "argTypes": {
        "title": { "type": "string", "required": true },
        "description": { "type": "string", "required": false },
        "tag": { "type": "string", "required": false }
      }
    }
  ]
}
```

---

### Server: Serve & Watch the Registry

In `server/app.ts`, add:

```typescript
// Serve the registry to the panel
app.get('/component-registry', (_req, res) => {
  const registryPath = path.join(process.cwd(), 'component-registry.json');
  res.sendFile(registryPath, err => {
    if (err) res.status(404).json({ error: 'No registry found. Run build_component_registry.' });
  });
});

// Watch for file changes (e.g. agent writes it, or user edits manually)
import { watch } from 'fs';
watch(path.join(process.cwd(), 'component-registry.json'), () => {
  broadcast({ type: 'COMPONENT_REGISTRY_UPDATED', to: 'panel' });
});
```

---

### Panel: Fetch & Use the Registry

The panel fetches the registry on load and on every `COMPONENT_REGISTRY_UPDATED` message:

```typescript
// panel/src/hooks/useComponentRegistry.ts
export function useComponentRegistry() {
  const [registry, setRegistry] = useState<ComponentRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_ORIGIN}/component-registry`);
      if (!res.ok) throw new Error(await res.text());
      setRegistry(await res.json());
      setError(null);
    } catch (e) {
      setError('No component registry. Ask the agent to run build_component_registry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    // Re-fetch when agent updates the registry
    return onMessage('COMPONENT_REGISTRY_UPDATED', load);
  }, []);

  return { registry, loading, error, reload: load };
}
```

---

### Dynamic Import for Host-Page Rendering

This is the critical piece that makes the registry useful at runtime. Using the same Import Mode as Approach B (overlay loaded as an ES module), the overlay can `import()` any component by its registry `importPath`:

```typescript
// overlay/src/module.ts (import mode only)

const componentCache = new Map<string, React.ComponentType<any>>();

export async function importComponent(importPath: string): Promise<React.ComponentType<any> | null> {
  if (componentCache.has(importPath)) return componentCache.get(importPath)!;

  try {
    // importPath is relative to project root: "src/components/Button.tsx"
    // Dynamic import needs a URL relative to the overlay module's location.
    // Since overlay.esm.js is served from the MCP server, we import from the
    // host app's dev server origin instead.
    const hostOrigin = getHostAppOrigin(); // e.g. http://localhost:5173
    const mod = await import(/* @vite-ignore */ `${hostOrigin}/${importPath}`);

    // Try named export matching component name, then default export
    const component = Object.values(mod).find(
      v => typeof v === 'function' && /^[A-Z]/.test((v as any).name ?? '')
    ) as React.ComponentType<any> | undefined;

    if (component) {
      componentCache.set(importPath, component);
      return component;
    }
    return null;
  } catch {
    return null;
  }
}
```

> **Note**: Dynamic import of host-app modules works cleanly when the overlay is in Import Mode and the host app uses Vite (which supports HMR-aware dynamic imports). For non-Vite build tools (webpack, Parcel, etc.), the import URL strategy may need adjustment — see Open Questions.

---

## Advantages Over Approaches A and B

| | Approach A (Storybook) | Approach B (Fiber) | **Approach C (MCP Registry)** |
|---|---|---|---|
| **Requires Storybook** | Yes | No | No |
| **Sees all components** | Only those with stories | Only components on current page | **Yes — static analysis covers all** |
| **Prop metadata quality** | High (TypeScript reflection) | Medium (inferred from usage) | **High (agent reads TypeScript interfaces)** |
| **Setup effort** | Storybook integration | Import mode | **One MCP tool call** |
| **Stays up to date** | Requires story maintenance | Automatic (fiber is live) | Requires re-running `build_component_registry` |
| **Works without running Storybook** | No | Yes | **Yes** |
| **Rendering** | Storybook iframes | Host-page React | **Host-page React (via import mode)** |

---

## Relevant Files

| File | Change |
|------|--------|
| `server/mcp-tools.ts` | Add `build_component_registry`, `notify_registry_updated`, `get_component_registry` tools |
| `server/app.ts` | Add `GET /component-registry` route + file watcher |
| `shared/types.ts` | Add `ComponentRegistry`, `RegistryEntry`, `COMPONENT_REGISTRY_UPDATED` message type |
| `panel/src/hooks/useComponentRegistry.ts` | New hook — fetches registry + listens for updates |
| `panel/src/components/ComponentPalette/` | Extend to accept `ComponentRegistry` (same UI as Approaches A/B) |
| `overlay/src/module.ts` | Add `importComponent()` with dynamic import + cache |
| `component-registry.json` | Written by agent; add to `.gitignore` or commit as generated artifact |

---

## Verification

1. **Tool prompt test**: Call `build_component_registry` in a session with the test-app; verify agent writes `component-registry.json` containing Button, Card, Badge with correct argTypes
2. **File watch**: Manually edit `component-registry.json`; verify panel receives `COMPONENT_REGISTRY_UPDATED` without refresh
3. **`useComponentRegistry` test**: Mock `fetch` returning valid registry JSON; verify hook exposes components list; mock `COMPONENT_REGISTRY_UPDATED` message; verify hook re-fetches
4. **Dynamic import**: In import mode, call `importComponent('src/components/Button.tsx')`; verify it returns the Button function; call again; verify cache hit (no second network request)
5. **Full loop**: Run `build_component_registry` → open ComponentPalette → select Button → configure props → place on canvas → queue change → verify MCP `implement_next_change` returns JSX with correct prop values

---

## Open Questions

1. **Dynamic import URL for non-Vite build tools**: The `${hostOrigin}/src/components/Button.tsx` pattern works because Vite's dev server serves source files directly. Webpack's dev server does not — it serves bundles. For webpack projects, the agent would need to produce a different import strategy (e.g. a generated entry point at a known URL, or explicit `registerComponents` at app startup). Recommend documenting this as a known limitation and providing Vite-first support initially.

2. **Registry staleness**: The registry is a generated snapshot. If someone adds a new component and doesn't re-run `build_component_registry`, the ComponentPalette is out of date. Options: (a) add a "Refresh Registry" button to the ComponentPalette UI that calls the tool; (b) have the agent auto-run `build_component_registry` as part of its setup loop; (c) watch source files on the server and auto-trigger a rebuild (complex, not recommended for v1).

3. **Gitignore vs. commit**: `component-registry.json` is generated output but potentially useful to commit for teams. Recommendation: commit it (like `package-lock.json`) so team members don't each need to run `build_component_registry`.

4. **Security**: The `GET /component-registry` endpoint is served from the MCP server to the panel. Since the MCP server only runs locally during development, this is fine. Do not expose this endpoint in production.

5. **`children` as a prop**: The agent should represent `children: React.ReactNode` as `{ type: 'string', required: false }` in the registry, treating children as a plain text input in PropEditor. Complex nested JSX children are out of scope for v1.
