# 022 — Storybook Addon (Minimal: No Proxy)

## Overview

A minimal Storybook addon that runs `preview.ts` inside every story iframe. This solves the
cross-origin problems the Draw tab currently works around via a reverse proxy — body padding,
content height measurement, and `storyPrepared` message routing — without the complexity of
proxying Vite's asset paths through Express.

This spec covers Phase 1 only: eliminating the proxy requirement for the Draw tab. The full
addon vision (overlay injection, inspector panel tab, `RESET_SELECTION`) is in spec 018.

---

## Problem

The Draw tab renders Storybook stories as inline iframes. Currently those iframes load through
a proxy at `/storybook/...` so the panel can call `iframe.contentDocument` (same-origin). This
proxy must forward every Vite asset path (`/@vite/client`, `/node_modules/.cache/...`, etc.),
which requires fragile path enumeration in `server/app.ts` and adds operational complexity.

Without the proxy, the iframes load from `http://localhost:6007` — a different origin — so:
- `iframe.contentDocument` throws a cross-origin error (can't set `body.style` from outside)
- `ResizeObserver` on `contentDocument.body` is blocked
- The panel must sniff raw `window.postMessage` to detect `storyPrepared`

A `preview.ts` addon entry point runs *inside* the iframe at the same origin as the story. It
has unrestricted `document` access. It can solve all three problems from the inside and post
results to the parent window via `postMessage`.

---

## Goals

- Remove the need for the proxy to embed story iframes in the Draw tab
- Reset body margin/padding on every story iframe (no whitespace around components)
- Post content height to the parent so the Draw tab can auto-size iframes
- Wire the addon into the local `test-app` Storybook for immediate use
- Structure the addon so external users can `npm install @bitovi/vybit` and configure one line

## Non-Goals

- Injecting the overlay script (spec 018)
- Registering an inspector panel tab in Storybook's shell (spec 018)
- `RESET_SELECTION` on story navigation (spec 018)
- Removing the proxy from `server/app.ts` — it stays, Draw tab just stops using it

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Remove proxy from server? | No — leave it | Proxy may still be useful for other scenarios |
| Height posting | Yes — `ResizeObserver` | Replaces hardcoded `160px` iframe height |
| Local wiring | Relative path in `main.ts` | No separate `package.json` needed inside addon |
| Message namespace | `VYBIT_STORY_HEIGHT` | Avoids collision with Storybook's own channel messages |

---

## Package Structure

```
storybook-addon/          ← new directory at workspace root
  preset.ts               ← Storybook auto-registration. Tells Storybook where preview.ts is.
  preview.ts              ← Runs inside every story iframe. Fixes padding + posts height.
```

No `package.json` needed in `storybook-addon/` for local dev — Storybook resolves the preset
directly from the `.ts` file path when pointed at it in `main.ts`. External users get the
preset via the `@bitovi/vybit/storybook-addon` export from the root package.

---

## Implementation

### `storybook-addon/preset.ts`

Storybook calls this at build time to discover addon entry points. ESM-compatible because the
root package is `"type": "module"`.

```ts
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function previewAnnotations(entry: string[] = []) {
  return [...entry, join(__dirname, 'preview.ts')];
}
```

### `storybook-addon/preview.ts`

Runs inside each story iframe. Decorator is transparent — returns `StoryFn()` unchanged.

```ts
import type { Decorator } from '@storybook/react';

let initialized = false;

const withVybitSetup: Decorator = (StoryFn) => {
  if (!initialized) {
    initialized = true;
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    const observer = new ResizeObserver(() => {
      window.parent.postMessage(
        { type: 'VYBIT_STORY_HEIGHT', height: document.body.scrollHeight },
        '*'
      );
    });
    observer.observe(document.body);
  }

  return StoryFn();
};

export const decorators = [withVybitSetup];
```

### `package.json` (root) — additions

Add `"storybook-addon/"` to `files` and an `exports` field:

```json
{
  "files": [
    "loader.mjs",
    "server/",
    "overlay/dist/",
    "panel/dist/",
    "shared/",
    "storybook-addon/"
  ],
  "exports": {
    ".": "./loader.mjs",
    "./storybook-addon": "./storybook-addon/preset.ts"
  }
}
```

### `test-app/.storybook/main.ts` — add addon

```ts
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '../../storybook-addon/preset.ts',   // ← add this
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};
```

### `panel/src/components/DrawTab/DrawTab.tsx` — pass `directUrl`

`/api/storybook-data` already returns `directUrl` (e.g. `http://localhost:6007`). Pass it down:

```tsx
// In useComponentGroups, capture directUrl from the response
const [directUrl, setDirectUrl] = useState<string | null>(null);

// In the effect, after setting groups:
setDirectUrl(data.directUrl ?? null);

// Pass to ComponentGroupItem:
<ComponentGroupItem key={group.name} group={group} storybookUrl={directUrl ?? ''} />
```

### `panel/src/components/DrawTab/components/ComponentGroupItem/ComponentGroupItem.tsx`

Accept the new prop and replace the hardcoded proxy base:

```ts
// Before:
const base = '/storybook';

// After:
interface ComponentGroupItemProps {
  group: ComponentGroup;
  storybookUrl: string;   // ← new
}
export function ComponentGroupItem({ group, storybookUrl }: ComponentGroupItemProps) {
  const base = storybookUrl;
  // ... rest unchanged
```

### `panel/src/components/DrawTab/components/StoryRow/StoryRow.tsx`

Listen for `VYBIT_STORY_HEIGHT` and replace the hardcoded `160` height:

```tsx
const [iframeHeight, setIframeHeight] = useState(160);

useEffect(() => {
  if (!isOpen) return;
  function handleMessage(e: MessageEvent) {
    // existing storyPrepared handling ...
    if (e.data?.type === 'VYBIT_STORY_HEIGHT' && typeof e.data.height === 'number') {
      setIframeHeight(e.data.height);
    }
  }
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [isOpen, story.id]);

// In JSX:
<iframe
  src={iframeSrc}
  style={{ height: iframeHeight }}
  ...
/>
```

---

## External User Setup

Once shipped as `@bitovi/vybit`:

```ts
// .storybook/main.ts
export default {
  addons: [
    '@storybook/addon-essentials',
    '@bitovi/vybit/storybook-addon',  // ← one line
  ],
};
```

No `preview.ts` changes needed — the addon handles everything automatically.

---

## Verification Checklist

1. Open the Draw tab → expand a component group → click "Open" on a story
2. The iframe renders without whitespace around the component (body margin/padding = 0)
3. In DevTools, the iframe `src` is `http://localhost:6007/iframe.html?...` (not `/storybook/...`)
4. The iframe height adjusts to match the component's content (not stuck at 160px)
5. No cross-origin errors in the browser console
6. Storybook loads normally at `http://localhost:6007`
7. Existing tests still pass: `cd panel && npm test`

---

## Files Changed

| File | Status |
|---|---|
| `storybook-addon/preset.ts` | New |
| `storybook-addon/preview.ts` | New |
| `package.json` | Edit — add `files` entry + `exports` field |
| `test-app/.storybook/main.ts` | Edit — add addon to `addons` array |
| `panel/src/components/DrawTab/DrawTab.tsx` | Edit — pass `directUrl` as `storybookUrl` |
| `panel/src/components/DrawTab/components/ComponentGroupItem/ComponentGroupItem.tsx` | Edit — accept `storybookUrl` prop |
| `panel/src/components/DrawTab/components/StoryRow/StoryRow.tsx` | Edit — dynamic height from `VYBIT_STORY_HEIGHT` |
