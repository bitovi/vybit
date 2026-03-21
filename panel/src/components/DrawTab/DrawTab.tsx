import { useEffect, useState } from 'react';
import type { ArgType, ComponentGroup, StoryEntry } from './types';
import { ComponentGroupItem } from './components/ComponentGroupItem';

export function DrawTab() {
  const { groups, loading, error } = useComponentGroups();

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted">
          Components
        </div>
        {loading && (
          <div className="text-[11px] text-bv-muted">Loading components…</div>
        )}
        {!loading && error && (
          <div className="text-[11px] text-bv-text-mid leading-relaxed">
            <span className="block mb-0.5">Storybook not detected.</span>
            <span className="text-bv-muted">Start Storybook on port 6006–6010 to browse components.</span>
          </div>
        )}
        {!loading && !error && groups.length === 0 && (
          <div className="text-[11px] text-bv-muted">No stories found.</div>
        )}
        {!loading && !error && groups.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {groups.map(group => (
              <ComponentGroupItem
                key={group.name}
                group={group}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function useComponentGroups() {
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetch('/api/storybook-data').then(r => r.json()) as {
          available: boolean;
          index?: Record<string, unknown>;
          argTypes?: Record<string, Record<string, ArgType>>;
        };
        if (!data.available) {
          if (!cancelled) { setError(true); setLoading(false); }
          return;
        }
        const entries = Object.values(
          ((data.index?.entries ?? data.index?.stories ?? {}) as Record<string, StoryEntry>)
        );
        if (!cancelled) setGroups(groupByComponent(entries, data.argTypes ?? {}));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { groups, loading, error };
}

function groupByComponent(
  entries: StoryEntry[],
  serverArgTypes: Record<string, Record<string, ArgType>> = {}
): ComponentGroup[] {
  const map = new Map<string, StoryEntry[]>();
  for (const entry of entries) {
    // title: "Components/Button" → component name: "Button"
    const name = entry.title.split('/').at(-1) ?? entry.title;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(entry);
  }
  return Array.from(map.entries()).map(([name, stories]) => ({
    name,
    stories,
    // Prefer server-loaded argTypes (from the actual story file) over index.json (which has none)
    argTypes: serverArgTypes[name] ?? mergeArgTypes(stories),
  }));
}

function mergeArgTypes(stories: StoryEntry[]): ComponentGroup['argTypes'] {
  const merged: ComponentGroup['argTypes'] = {};
  for (const story of stories) {
    for (const [key, argType] of Object.entries(story.argTypes ?? {})) {
      if (!(key in merged)) merged[key] = argType;
    }
  }
  return merged;
}
