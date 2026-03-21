# 011 — Draw with Components: Implementation Plan

## Approach

Assume Storybook is running alongside the app. The MCP server proxies it at `/storybook`, making it same-origin with the panel. The panel fetches `/storybook/index.json` to get the full component/story catalog with argTypes — no static builds, no `react-docgen-typescript`, no fallback renderers.

---

## Phase 1 — test-app Storybook setup

The test-app has four components: `Button`, `Card`, `Badge`, `Tag`. Add Storybook and write stories for each.

### 1a. Install Storybook in test-app

```bash
cd test-app
npx storybook@latest init --type react
```

Configure port 6007 in `test-app/package.json` scripts (6006 is reserved for the panel's own Storybook):

```json
"scripts": {
  "storybook": "storybook dev -p 6007",
  "build-storybook": "storybook build"
}
```

### 1b. Write stories

**`test-app/src/components/Button.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary'] },
    children: { control: 'text' },
  },
};
export default meta;

export const Primary: StoryObj<typeof Button> = {
  args: { variant: 'primary', children: 'Click me' },
};
export const Secondary: StoryObj<typeof Button> = {
  args: { variant: 'secondary', children: 'Cancel' },
};
```

**`test-app/src/components/Badge.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  argTypes: {
    color: { control: 'select', options: ['blue', 'green', 'yellow', 'red', 'gray'] },
    children: { control: 'text' },
  },
};
export default meta;

export const Blue: StoryObj<typeof Badge> = {
  args: { color: 'blue', children: 'New' },
};
export const Green: StoryObj<typeof Badge> = {
  args: { color: 'green', children: 'Active' },
};
```

**`test-app/src/components/Card.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    tag: { control: 'text' },
  },
};
export default meta;

export const Default: StoryObj<typeof Card> = {
  args: { title: 'Card Title', description: 'Card description goes here.', tag: 'Tag' },
};
```

**`test-app/src/components/Tag.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = {
  title: 'Components/Tag',
  component: Tag,
  argTypes: {
    color: { control: 'select', options: ['blue', 'red', 'green'] },
    children: { control: 'text' },
  },
};
export default meta;

export const Blue: StoryObj<typeof Tag> = {
  args: { color: 'blue', children: 'Design' },
};
```

---

## Phase 2 — VS Code task + startup documentation

### 2a. Add task to `.vscode/tasks.json`

Add a new task for the test-app Storybook:

```json
{
  "label": "Storybook: Test App (port 6007)",
  "type": "shell",
  "command": "npm run storybook",
  "options": { "cwd": "${workspaceFolder}/test-app" },
  "isBackground": true,
  "problemMatcher": {
    "owner": "storybook-test-app",
    "pattern": { "regexp": "^(Error): (.*)$", "severity": 1, "message": 2 },
    "background": { "activeOnStart": true, "beginsPattern": "storybook", "endsPattern": "Local:" }
  },
  "presentation": { "panel": "dedicated", "reveal": "always" }
}
```

### 2b. Update copilot-instructions.md

Add `Storybook: Test App (port 6007)` to the "Running Everything" section. Document that this should be started alongside the test app when working on the Draw tab. Also update the mock MCP client section to note the `STORYBOOK_URL` env var (see Phase 3b).

---

## Phase 3 — Server: Storybook detection + proxy

### 3a. Storybook detection at startup

Add `server/storybook.ts`:

```typescript
const SCAN_PORTS = [6006, 6007, 6008, 6009, 6010];

/** Returns the Storybook base URL or null if not found. Priority:
 *  1. STORYBOOK_URL env var
 *  2. Port scan 6006–6010
 */
export async function detectStorybookUrl(): Promise<string | null> {
  if (process.env.STORYBOOK_URL) {
    console.error(`[storybook] Using STORYBOOK_URL=${process.env.STORYBOOK_URL} (from env)`);
    return process.env.STORYBOOK_URL;
  }

  for (const port of SCAN_PORTS) {
    const url = `http://localhost:${port}`;
    if (await probeUrl(url)) {
      console.error(`[storybook] Auto-detected at ${url}`);
      return url;
    }
  }

  console.error('[storybook] Not detected — Draw tab will show "Start Storybook" prompt');
  return null;
}

async function probeUrl(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/index.json`, { signal: AbortSignal.timeout(500) });
    if (!res.ok) return false;
    const data = await res.json();
    // Verify it's actually Storybook: v6 uses `stories`, v7+ uses `entries`
    return typeof data.v === 'number' && (data.entries != null || data.stories != null);
  } catch {
    return false;
  }
}
```

### 3b. Proxy middleware in `server/app.ts`

Install `http-proxy-middleware`:

```bash
npm install http-proxy-middleware
```

In `createApp`, accept an optional `storybookUrl` parameter and mount the proxy:

```typescript
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createApp(packageRoot: string, storybookUrl: string | null = null): express.Express {
  // ... existing routes ...

  // Storybook proxy — mounts same-origin so html2canvas can composite iframes
  if (storybookUrl) {
    app.use('/storybook', createProxyMiddleware({
      target: storybookUrl,
      changeOrigin: true,
      pathRewrite: { '^/storybook': '' },
    }));
    console.error(`[storybook] Proxying /storybook → ${storybookUrl}`);
  }

  // Status endpoint for the panel
  app.get('/api/storybook-status', (_req, res) => {
    res.json({ url: storybookUrl ? '/storybook' : null });
  });

  return app;
}
```

### 3c. Wire detection into `server/index.ts`

```typescript
import { detectStorybookUrl } from './storybook.js';

// After tailwind check, before httpServer.listen:
const storybookUrl = await detectStorybookUrl();
const app = createApp(packageRoot, storybookUrl);
```

### 3d. Mock MCP client: pass STORYBOOK_URL

In `test-app/mock-mcp-client.ts`, when spawning the server via stdio, add `STORYBOOK_URL` to the env so the spawned server knows where to find Storybook:

```typescript
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', serverScript],
  env: {
    ...process.env,
    STORYBOOK_URL: process.env.STORYBOOK_URL ?? 'http://localhost:6007',
  },
});
```

The `STORYBOOK_URL` defaults to `6007` (test-app Storybook) but can be overridden by the caller.

---

## Phase 4 — Panel: "Draw" tab

### 4a. Add "Draw" tab to `App.tsx`

In the `TABS` array, add a `draw` tab:

```typescript
const TABS: Tab[] = [
  { id: "design", label: "Design" },
  { id: "draw", label: "Draw" },
  { id: "message", label: "Message" },
];
```

Render `<DrawTab />` when `activeTab === 'draw'`.

### 4b. `DrawTab` modlet

**`panel/src/components/DrawTab/`** — new modlet:

```
DrawTab/
  index.ts
  DrawTab.tsx
  DrawTab.test.tsx
  DrawTab.stories.tsx
  types.ts
```

**`types.ts`**

```typescript
export interface StoryEntry {
  id: string;
  title: string;   // e.g. "Components/Button"
  name: string;    // e.g. "Primary"
}

export interface ComponentGroup {
  name: string;    // e.g. "Button"
  stories: StoryEntry[];
}
```

**`DrawTab.tsx`**

Fetches `/api/storybook-status` on mount. If Storybook is available, fetches `/storybook/index.json` and groups entries by component name (first segment of `title` after the category prefix). Renders a `Components` section with the list.

```typescript
export function DrawTab() {
  const { groups, loading, error } = useComponentGroups();

  if (loading) return <div className="p-4 text-bv-muted text-sm">Loading components…</div>;

  if (error) return (
    <div className="p-4 text-bv-text-mid text-sm">
      <p className="font-medium mb-1">Storybook not detected</p>
      <p className="text-bv-muted">Start Storybook on port 6006–6010 to use the Draw tab.</p>
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-xs font-semibold text-bv-muted uppercase tracking-wider mb-3">
        Components
      </h2>
      <ul className="space-y-1">
        {groups.map(group => (
          <li key={group.name} className="text-sm text-bv-text px-2 py-1 rounded hover:bg-bv-surface-hi cursor-pointer">
            {group.name}
            <span className="text-bv-muted text-xs ml-2">{group.stories.length} stories</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**`useComponentGroups` hook (in `DrawTab.tsx` or extracted to `hooks/useComponentGroups.ts`)**

```typescript
function useComponentGroups() {
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const status = await fetch('/api/storybook-status').then(r => r.json());
        if (!status.url) { setError(true); setLoading(false); return; }

        const index = await fetch('/storybook/index.json').then(r => r.json());
        const entries: StoryEntry[] = Object.values(index.entries ?? index.stories ?? {});
        setGroups(groupByComponent(entries));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { groups, loading, error };
}

function groupByComponent(entries: StoryEntry[]): ComponentGroup[] {
  const map = new Map<string, StoryEntry[]>();
  for (const entry of entries) {
    // title: "Components/Button" → component name: "Button"
    const name = entry.title.split('/').at(-1) ?? entry.title;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(entry);
  }
  return Array.from(map.entries()).map(([name, stories]) => ({ name, stories }));
}
```

---

## Verification

1. **test-app Storybook starts**: `cd test-app && npm run storybook` → Storybook at `http://localhost:6007` with Button, Card, Badge, Tag stories visible
2. **Port scan**: Start server without `STORYBOOK_URL`; confirm log shows `[storybook] Auto-detected at http://localhost:6007`
3. **`STORYBOOK_URL` override**: `STORYBOOK_URL=http://localhost:9009 npx tsx watch ../server/index.ts` → log shows `(from env)`
4. **Proxy route**: With server running and Storybook on 6007, `GET http://localhost:3333/storybook/index.json` returns Storybook's story index
5. **`/api/storybook-status`**: Returns `{ "url": "/storybook" }` when Storybook up, `{ "url": null }` when not
6. **Draw tab visible**: Panel shows a "Draw" tab between "Design" and "Message"
7. **Component list**: Draw tab shows Button, Card, Badge, Tag under a "Components" heading, each with a story count
8. **No Storybook**: Stop Storybook; restart server; Draw tab shows "Start Storybook" message instead of component list
9. **Mock MCP client**: Start via VS Code task; confirm server subprocess receives `STORYBOOK_URL=http://localhost:6007`

---

## Follow-up Features

- **Component placement on canvas**: Click a component in the Draw tab to place a Storybook iframe onto the design canvas. Draggable and resizable.
- **PropEditor**: When a component is selected/placed, render a control panel from the story's `argTypes` (select, text, boolean, number). Iframe URL updates live as props change.
- **"Queue as Change" from Draw tab**: Capture the canvas (freehand + placed components via `html2canvas`, same-origin so compositing works) + serialize placed components to JSX. Queue as a `component-design` patch.
- **Panel port configuration**: A port input in the Draw tab header. Submitting it calls `POST /api/storybook-port` on the MCP server, which rebuilds the proxy to point at the new port. Persists across reloads via `localStorage`.
- **Story variant picker**: Clicking a component in the list expands it to show individual story variants. Clicking a variant pre-fills the PropEditor with that story's `args`.
- **Search**: Filter the component list by name.
- **Category grouping**: Group components by their Storybook title prefix (e.g. "Components", "Layout", "Forms") with collapsible sections.
