import { useEffect, useState, useCallback } from 'react';
import type { ArgType, ComponentGroup, StoryEntry } from './types';
import type { InsertMode } from '../../../../shared/types';
import { ComponentGroupItem } from './components/ComponentGroupItem';
import { sendTo, onMessage } from '../../ws';
import { useGhostCache } from '../../hooks/useGhostCache';

interface DrawTabProps {
  /** Controls the insertMode sent with COMPONENT_ARM: 'replace' or default drop behavior */
  insertMode?: 'replace' | 'place';
}

export function DrawTab({ insertMode }: DrawTabProps = {}) {
  const { groups, loading, error, refetch } = useComponentGroups();
  const [armedGroup, setArmedGroup] = useState<string | null>(null);
  const [armedCanvas, setArmedCanvas] = useState(false);
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
      insertMode: insertMode === 'replace' ? 'replace' : undefined,
    });
  }, [insertMode]);

  const disarm = useCallback(() => {
    setArmedGroup(null);
    sendTo('overlay', { type: 'COMPONENT_DISARM' });
  }, []);

  // Disarm when the overlay tells us the user placed or escaped in the app
  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === 'COMPONENT_DISARMED') {
        setArmedGroup(null);
        setArmedCanvas(false);
      }
    });
  }, []);

  // Disarm when the user clicks anywhere in the panel (while armed)
  // The arm button calls e.stopPropagation() so it won't trigger this handler
  useEffect(() => {
    if (!armedGroup && !armedCanvas) return;
    const handler = () => {
      setArmedGroup(null);
      setArmedCanvas(false);
      sendTo('overlay', { type: 'COMPONENT_DISARM' });
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [armedGroup, armedCanvas]);

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Canvas button — triggers design canvas on the overlay */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (armedCanvas) {
            // Already armed — disarm
            setArmedCanvas(false);
            sendTo('overlay', { type: 'COMPONENT_DISARM' });
            return;
          }
          setArmedCanvas(true);
          const mode: InsertMode = insertMode === 'replace' ? 'replace' : 'after';
          sendTo('overlay', { type: 'INSERT_DESIGN_CANVAS', insertMode: mode });
        }}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-md border transition-all cursor-pointer text-left ${
          armedCanvas
            ? 'border-bv-teal bg-bv-teal/10 ring-1 ring-bv-teal'
            : 'border-bv-border bg-bv-surface hover:border-bv-teal hover:bg-bv-teal/5'
        }`}
      >
        <div className="w-8 h-8 rounded bg-bv-teal/10 text-bv-teal flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M15 1H1v14h14V1ZM0 0h16v16H0V0Z" />
            <path d="M4 8h8M8 4v8" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium text-bv-text">Draw / Screenshot Canvas</span>
          <span className="text-[10px] text-bv-muted">Freehand drawing or annotate a screenshot</span>
        </div>
      </button>

      <div className="flex flex-col gap-1.5">
        {loading && (
          <div className="text-[11px] text-bv-muted">Loading components…</div>
        )}
        {!loading && error && (
          <StorybookConnect onConnected={refetch} />
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

function StorybookConnect({ onConnected }: { onConnected: () => void }) {
  const [port, setPort] = useState('');
  const [scanning, setScanning] = useState(false);
  const [failed, setFailed] = useState(false);

  const reconnect = async (customPort?: number) => {
    setScanning(true);
    setFailed(false);
    try {
      const body = customPort != null ? { port: customPort } : {};
      const res = await fetch('/api/storybook-reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean };
      if (data.ok) {
        onConnected();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="text-[11px] text-bv-text-mid leading-relaxed flex flex-col gap-2">
      <span>Storybook not detected.</span>
      <button
        onClick={() => reconnect()}
        disabled={scanning}
        className="self-start px-2.5 py-1 rounded bg-bv-surface-hi text-bv-text text-[11px] border border-bv-border hover:border-bv-teal disabled:opacity-50 transition-colors"
      >
        {scanning ? 'Scanning…' : 'Scan for Storybook'}
      </button>
      <div className="flex items-center gap-1.5">
        <span className="text-bv-muted">or port:</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="6006"
          value={port}
          onChange={e => { setPort(e.target.value); setFailed(false); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && port) reconnect(Number(port));
          }}
          className="w-16 px-1.5 py-0.5 rounded bg-bv-surface text-bv-text text-[11px] border border-bv-border focus:border-bv-teal outline-none"
        />
        <button
          onClick={() => port && reconnect(Number(port))}
          disabled={!port || scanning}
          className="px-2 py-0.5 rounded bg-bv-surface-hi text-bv-text text-[11px] border border-bv-border hover:border-bv-teal disabled:opacity-50 transition-colors"
        >
          Connect
        </button>
      </div>
      {failed && (
        <span className="text-bv-orange text-[10px]">
          No Storybook found{port ? ` on port ${port}` : ''}. Is it running?
        </span>
      )}
    </div>
  );
}

function useComponentGroups() {
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(false);
    setGroups([]);
    setFetchKey(k => k + 1);
  }, []);

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
  }, [fetchKey]);

  return { groups, loading, error, refetch };
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
  const groups = Array.from(map.entries()).map(([name, stories]) => {
    // Collect unique tags across all stories in this group
    const tagSet = new Set<string>();
    for (const s of stories) {
      for (const t of s.tags ?? []) tagSet.add(t);
    }
    return {
      name,
      fullTitle: stories[0]?.title ?? name,
      tags: Array.from(tagSet),
      stories,
      // Prefer server-loaded argTypes (from the actual story file) over index.json (which has none)
      argTypes: serverArgTypes[name] ?? mergeArgTypes(stories),
      componentPath: stories[0]?.componentPath,
    };
  });

  // Sort: design-system tagged groups first, then alphabetical by name
  groups.sort((a, b) => {
    const aDS = a.tags.includes('design-system') ? 0 : 1;
    const bDS = b.tags.includes('design-system') ? 0 : 1;
    if (aDS !== bDS) return aDS - bDS;
    return a.name.localeCompare(b.name);
  });

  return groups;
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
