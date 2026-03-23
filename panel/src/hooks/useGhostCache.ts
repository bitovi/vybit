import { useState, useEffect, useCallback, useRef } from 'react';
import type { GhostCacheEntry } from '../../../shared/types';

interface GhostCacheResult {
  /** Look up a cached ghost by storyId and optional args. */
  getCachedGhost: (storyId: string, args?: Record<string, unknown>) => { ghostHtml: string; hostStyles: Record<string, string> } | null;
  /** Submit (or refresh) a ghost in the server cache. Fire-and-forget. */
  submitToCache: (params: {
    storyId: string;
    args?: Record<string, unknown>;
    ghostHtml: string;
    hostStyles: Record<string, string>;
    componentName: string;
    componentPath?: string;
  }) => void;
  loaded: boolean;
}

function argsHashKey(args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return '';
  return JSON.stringify(args, Object.keys(args).sort());
}

function cacheKey(storyId: string, args?: Record<string, unknown>): string {
  const hash = argsHashKey(args);
  return hash ? `${storyId}::${hash}` : storyId;
}

export function useGhostCache(): GhostCacheResult {
  const [loaded, setLoaded] = useState(false);
  const cacheRef = useRef(new Map<string, GhostCacheEntry>());

  // Fetch all cached ghosts on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ghost-cache')
      .then(r => r.json())
      .then((entries: GhostCacheEntry[]) => {
        if (cancelled) return;
        const map = new Map<string, GhostCacheEntry>();
        for (const entry of entries) {
          const key = entry.argsHash
            ? `${entry.storyId}::${entry.argsHash}`
            : entry.storyId;
          map.set(key, entry);
        }
        cacheRef.current = map;
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const getCachedGhost = useCallback((storyId: string, args?: Record<string, unknown>) => {
    const key = cacheKey(storyId, args);
    const entry = cacheRef.current.get(key);
    if (!entry) return null;
    return { ghostHtml: entry.ghostHtml, hostStyles: entry.hostStyles, storyBackground: entry.storyBackground };
  }, []);

  const submitToCache = useCallback((params: {
    storyId: string;
    args?: Record<string, unknown>;
    ghostHtml: string;
    hostStyles: Record<string, string>;
    storyBackground?: string;
    componentName: string;
    componentPath?: string;
  }) => {
    const key = cacheKey(params.storyId, params.args);
    const alreadyCached = cacheRef.current.has(key);

    // Update local cache immediately
    cacheRef.current.set(key, {
      storyId: params.storyId,
      argsHash: argsHashKey(params.args),
      ghostHtml: params.ghostHtml,
      hostStyles: params.hostStyles,
      storyBackground: params.storyBackground,
      componentName: params.componentName,
      componentPath: params.componentPath,
      extractedAt: Date.now(),
    });

    // Skip the POST if this entry was already in the server cache
    if (alreadyCached) return;

    // Fire-and-forget to server
    fetch('/api/ghost-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId: params.storyId,
        args: params.args,
        ghostHtml: params.ghostHtml,
        hostStyles: params.hostStyles,
        storyBackground: params.storyBackground,
        componentName: params.componentName,
        componentPath: params.componentPath,
      }),
    }).catch(() => {});
  }, []);

  return { getCachedGhost, submitToCache, loaded };
}
