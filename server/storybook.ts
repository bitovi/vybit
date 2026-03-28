import path from 'path';

const SCAN_PORTS = [6006, 6007, 6008, 6009, 6010];

interface StorybookIndexEntry {
  title: string;
  importPath: string;
}

export interface ArgTypeInfo {
  control?: string | { type: string };
  options?: string[];
  description?: string;
  defaultValue?: unknown;
}

/**
 * Dynamically import each story file referenced by the Storybook index and
 * collect the argTypes declared on the default export (Meta object).
 * Returns a map of componentName → argTypes.
 */
export async function loadStoryArgTypes(
  storybookUrl: string
): Promise<Record<string, Record<string, ArgTypeInfo>>> {
  try {
    const res = await fetch(`${storybookUrl}/index.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const index = (await res.json()) as {
      entries?: Record<string, StorybookIndexEntry>;
      stories?: Record<string, StorybookIndexEntry>;
    };
    const entries = Object.values(index.entries ?? index.stories ?? {});

    // One story file per unique importPath; map it to the component name
    const seen = new Map<string, string>(); // importPath → componentName
    for (const entry of entries) {
      if (!seen.has(entry.importPath)) {
        const componentName = entry.title.split('/').at(-1) ?? entry.title;
        seen.set(entry.importPath, componentName);
      }
    }

    const cwd = path.resolve(process.cwd());
    const result: Record<string, Record<string, ArgTypeInfo>> = {};

    for (const [importPath, componentName] of seen) {
      // Security: only allow relative paths that stay within cwd
      if (!importPath.startsWith('./')) continue;
      const fullPath = path.resolve(cwd, importPath);
      if (!fullPath.startsWith(cwd + '/')) continue;

      try {
        // Append a cache-buster so Node's ESM module cache doesn't hold onto
        // stale argTypes after the story file is edited.
        const mod = await import(`${fullPath}?t=${Date.now()}`);
        const meta = mod.default as
          | { argTypes?: Record<string, ArgTypeInfo> }
          | undefined;
        if (meta?.argTypes) {
          result[componentName] = meta.argTypes;
        }
      } catch (err) {
        // ignore import errors
      }
    }

    return result;
  } catch (err) {
    return {};
  }
}

/**
 * Returns the Storybook base URL or null if not found.
 * Priority:
 *  1. STORYBOOK_URL env var
 *  2. Port scan 6006–6010
 */
export async function detectStorybookUrl(): Promise<string | null> {
  if (process.env.STORYBOOK_URL) {
    if (await probeStorybookUrl(process.env.STORYBOOK_URL)) {
      return process.env.STORYBOOK_URL;
    }
    // Env var URL is not reachable — fall through to port scan
  }

  for (const port of SCAN_PORTS) {
    const url = `http://localhost:${port}`;
    if (await probeStorybookUrl(url)) {
      return url;
    }
  }

  return null;
}

export async function probeStorybookUrl(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/index.json`, { signal: AbortSignal.timeout(500) });
    if (!res.ok) return false;
    const data = await res.json() as Record<string, unknown>;
    // Verify it's actually Storybook: v6 uses `stories`, v7+ uses `entries`
    return typeof data.v === 'number' && (data.entries != null || data.stories != null);
  } catch {
    return false;
  }
}
