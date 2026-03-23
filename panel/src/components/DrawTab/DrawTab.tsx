import { useEffect, useState, useCallback } from 'react';
import type { ArgType, ComponentGroup, StoryEntry } from './types';
import { ComponentGroupItem } from './components/ComponentGroupItem';
import { sendTo, onMessage } from '../../ws';
import { useGhostCache } from '../../hooks/useGhostCache';

export function DrawTab() {
  const { groups, loading, error } = useComponentGroups();
  const [armedGroup, setArmedGroup] = useState<string | null>(null);
  const { getCachedGhost, submitToCache } = useGhostCache();

  const arm = useCallback((group: ComponentGroup, ghostHtml: string, args?: Record<string, unknown>) => {
    setArmedGroup(group.name);
    sendTo('overlay', {
      type: 'COMPONENT_ARM',
      componentName: group.name,
      storyId: group.stories[0]?.id ?? '',
      ghostHtml,
      componentPath: group.componentPath,
      args,
    });
  }, []);

  const disarm = useCallback(() => {
    setArmedGroup(null);
    sendTo('overlay', { type: 'COMPONENT_DISARM' });
  }, []);

  // Disarm when the overlay tells us the user placed or escaped in the app
  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === 'COMPONENT_DISARMED') setArmedGroup(null);
    });
  }, []);

  // Disarm when the user clicks anywhere in the panel (while armed)
  // The arm button calls e.stopPropagation() so it won't trigger this handler
  useEffect(() => {
    if (!armedGroup) return;
    const handler = () => {
      setArmedGroup(null);
      sendTo('overlay', { type: 'COMPONENT_DISARM' });
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [armedGroup]);

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
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
          <ul className="flex flex-col gap-2">
            {groups.map(group => {
              const firstStoryId = group.stories[0]?.id;
              const cached = firstStoryId ? getCachedGhost(firstStoryId) : null;
              return (
                <ComponentGroupItem
                  key={group.name}
                  group={group}
                  isArmed={armedGroup === group.name}
                  onArm={(ghostHtml: string, args?: Record<string, unknown>) => arm(group, ghostHtml, args)}
                  onDisarm={disarm}
                  cachedGhostHtml={cached?.ghostHtml}
                  cachedHostStyles={cached?.hostStyles}
                  cachedStoryBackground={cached?.storyBackground}
                  onGhostExtracted={submitToCache}
                />
              );
            })}
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
    // Skip docs entries — they can't be rendered in viewMode=story
    if (entry.type === 'docs' || entry.id.endsWith('--docs')) continue;
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
    componentPath: stories[0]?.componentPath,
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
