import { useState, useEffect, useRef, useCallback } from 'react';
import type { ComponentGroup } from '../../types';
import { useStoryProbe } from '../../hooks/useStoryProbe';
import { useIframeSlot } from '../../hooks/useIframeQueue';
import { buildArgsUrl } from '../../hooks/useArgsUrl';
import { ArgsForm } from '../ArgsForm';
import type { AdaptiveIframe } from '../../../../../../overlay/src/adaptive-iframe/adaptive-iframe';
import '../../../../../../overlay/src/adaptive-iframe';

interface ComponentGroupItemProps {
  group: ComponentGroup;
  isArmed: boolean;
  onArm: (ghostHtml: string, args?: Record<string, unknown>) => void;
  onDisarm: () => void;
  cachedGhostHtml?: string;
  cachedHostStyles?: Record<string, string>;
  cachedStoryBackground?: string;
  onGhostExtracted?: (params: {
    storyId: string;
    args?: Record<string, unknown>;
    ghostHtml: string;
    hostStyles: Record<string, string>;
    storyBackground?: string;
    componentName: string;
    componentPath?: string;
  }) => void;
}

export function ComponentGroupItem({ group, isArmed, onArm, onDisarm, cachedGhostHtml, cachedHostStyles, cachedStoryBackground, onGhostExtracted }: ComponentGroupItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [storyBackground, setStoryBackground] = useState<string | undefined>(cachedStoryBackground);
  // Set to true on arm click to trigger a live iframe load even when we have cached HTML.
  const [loadLive, setLoadLive] = useState(false);
  const [showProps, setShowProps] = useState(false);

  // Only load when scrolled into view
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Skip probing cached components until the user requests props (gear click) or arms the component.
  // This avoids launching probe iframes — and the index.json requests they trigger — for every
  // visible cached card on panel open.
  const probeEnabled = isVisible && (!cachedGhostHtml || showProps || loadLive);
  console.log(`[ComponentGroupItem] ${group.name} isVisible=${isVisible} cachedGhostHtml=${!!cachedGhostHtml} probeEnabled=${probeEnabled}`);
  const { bestStory, probing, argTypes, defaultArgs } = useStoryProbe(group.stories, probeEnabled);
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const ghostRef = useRef<HTMLElement>(null);
  const initialLoadDone = useRef(false);
  const pendingArgsRef = useRef<Record<string, unknown> | null>(null);

  // Acquire a queue slot — only enters the queue once bestStory is resolved.
  // Skip the adaptive-iframe entirely for cached components until arm click (loadLive).
  const { canLoad, releaseSlot } = useIframeSlot(isVisible && !!bestStory && !probing && (!cachedGhostHtml || loadLive));

  // Sync default args from probe into local state when probe completes
  useEffect(() => {
    if (!probing && defaultArgs) {
      setArgs(defaultArgs);
    }
  }, [probing, defaultArgs]);

  // Listen for iframe errors and loaded — depends on bestStory so it re-runs after the
  // adaptive-iframe element renders (ghostRef.current is null until then)
  useEffect(() => {
    const handleError = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      setError(customEvent.detail.message);
      releaseSlot();
    };
    const handleLoaded = () => {

      setLiveReady(true);
      releaseSlot();
      // Apply any args that were changed before the iframe was ready
      if (pendingArgsRef.current) {
        const el = ghostRef.current as unknown as AdaptiveIframe;
        if (typeof el?.updateArgs === 'function' && bestStory) {

          el.updateArgs(bestStory.id, pendingArgsRef.current);
        }
        pendingArgsRef.current = null;
      }
    };
    const el = ghostRef.current as unknown as { addEventListener?: (event: string, handler: EventListener) => void; removeEventListener?: (event: string, handler: EventListener) => void };
    el?.addEventListener?.('iframe-error', handleError as EventListener);
    el?.addEventListener?.('iframe-loaded', handleLoaded);
    return () => {
      el?.removeEventListener?.('iframe-error', handleError as EventListener);
      el?.removeEventListener?.('iframe-loaded', handleLoaded);
    };
  }, [bestStory, releaseSlot]);

  // Listen for ghost-extracted events and submit to cache.
  // Always store with empty args — the iframe loads via buildArgsUrl(id, {}),
  // so the extracted ghost always reflects the default (no-args) state.
  // DrawTab looks up by storyId alone (no args hash), so this must match.
  useEffect(() => {
    if (!bestStory) return;
    const handleExtracted = (e: Event) => {
      const { ghostHtml, hostStyles, storyBackground: bg } = (e as CustomEvent<{ ghostHtml: string; hostStyles: Record<string, string>; storyBackground?: string }>).detail;

        if (bg) setStoryBackground(bg);
      onGhostExtracted?.({
        storyId: bestStory.id,
        args: {},
        ghostHtml,
        hostStyles,
        storyBackground: bg,
        componentName: group.name,
        componentPath: group.componentPath,
      });
    };
    const el = ghostRef.current as unknown as { addEventListener?: (event: string, handler: EventListener) => void; removeEventListener?: (event: string, handler: EventListener) => void };
    el?.addEventListener?.('ghost-extracted', handleExtracted as EventListener);
    return () => {
      el?.removeEventListener?.('ghost-extracted', handleExtracted as EventListener);
    };
  }, [bestStory, group.name, group.componentPath, onGhostExtracted]);

  // Set the story URL once a queue slot is granted
  useEffect(() => {
    if (!ghostRef.current || !bestStory || !canLoad || initialLoadDone.current) return;
    initialLoadDone.current = true;
    const initialUrl = buildArgsUrl(bestStory.id, {});

    ghostRef.current.setAttribute('src', initialUrl);
  }, [bestStory, canLoad]);

  // Subsequent args changes: send updateArgs to the existing iframe.
  // If the iframe isn't ready yet, queue the args and trigger a live load.
  const handleArgsChange = useCallback((newArgs: Record<string, unknown>) => {
    setArgs(newArgs);

    if (!ghostRef.current || !bestStory || !liveReady) {

      pendingArgsRef.current = newArgs;
      setLoadLive(true);
      return;
    }

    const el = ghostRef.current as unknown as AdaptiveIframe;
    if (typeof el.updateArgs === 'function') {
      el.updateArgs(bestStory.id, newArgs);
    }
  }, [bestStory, liveReady]);

  // Click card to arm/disarm
  const handleArmClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // prevent DrawTab's document click listener from immediately disarming
    if (isArmed) {
      onDisarm();
      return;
    }
    const el = ghostRef.current as unknown as AdaptiveIframe;
    const ghostHtml = el?.getComponentHtml?.() ?? cachedGhostHtml ?? '';
    onArm(ghostHtml, args);
    // Trigger a live iframe load to refresh the cache (also handles first arm for cached components).
    setLoadLive(true);
    // Refresh cache immediately on arm if we already have a live ghost (captures arg tweaks).
    if (onGhostExtracted && ghostHtml && bestStory) {
      const hostStyles = cachedHostStyles ?? {};
      onGhostExtracted({
        storyId: bestStory.id,
        args,
        ghostHtml,
        hostStyles,
        storyBackground,
        componentName: group.name,
        componentPath: group.componentPath,
      });
    }
  }, [isArmed, onArm, onDisarm, args, cachedGhostHtml, cachedHostStyles, bestStory, group.name, group.componentPath, onGhostExtracted]);

  // Show the gear if we have argTypes from the probe, OR if the group has cached argTypes,
  // OR if the component has a cached ghost (probe will run on gear click to populate argTypes).
  const hasArgs = Object.keys(argTypes).length > 0 || Object.keys(group.argTypes ?? {}).length > 0 || !!cachedGhostHtml;

  return (
    <li
      ref={cardRef}
      className={`group rounded border overflow-hidden cursor-pointer transition-[border-color,box-shadow] ${
        isArmed
          ? 'border-bv-teal shadow-[0_0_0_2px_var(--color-bv-teal),0_0_12px_rgba(0,132,139,0.2)]'
          : 'border-bv-border hover:border-[#555]'
      }`}
      onClick={handleArmClick}
    >
      {/* Preview area */}
      <div
        className={`flex items-center justify-center min-h-14 overflow-hidden ${isArmed ? 'bg-[rgba(0,132,139,0.06)]' : ''}`}
        style={!isArmed && storyBackground ? { backgroundColor: storyBackground } : undefined}
      >
        {!isVisible && (
          <span className="text-[10px] text-bv-muted"> </span>
        )}
        {isVisible && error && (
          <span className="text-[10px] text-bv-orange px-2 py-1 text-center leading-tight">{error}</span>
        )}
        {isVisible && !error && !cachedGhostHtml && !liveReady && (probing || !!bestStory) && (
          <span className="text-[10px] text-bv-muted">Loading preview…</span>
        )}
        {/* Cached ghost placeholder — shown immediately while live iframe loads */}
        {isVisible && !error && cachedGhostHtml && !liveReady && (
          <div
            className="pointer-events-none"
            dangerouslySetInnerHTML={{ __html: cachedGhostHtml }}
          />
        )}
        {isVisible && !error && !probing && bestStory && (
          // @ts-expect-error — custom element not in JSX.IntrinsicElements
          <adaptive-iframe
            ref={ghostRef}
            style={{ pointerEvents: 'none' }}
          />
        )}
        {isVisible && !error && !probing && !bestStory && !cachedGhostHtml && (
          <span className="text-[10px] text-bv-muted">No stories found.</span>
        )}
      </div>

      {/* Footer: name ↔ placement hint + optional gear */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-bv-border bg-bv-bg">
        {isArmed ? (
          <span className="text-[11px] font-medium text-bv-teal">Click the page to place</span>
        ) : (
          group.stories[0] ? (
            <a 
              href={`/storybook/?path=/story/${group.stories[0].id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-bv-text hover:text-bv-orange hover:underline transition-colors"
              onClick={(e) => { e.stopPropagation(); }}
            >
              {group.name}
            </a>
          ) : (
            <span className="text-[11px] font-semibold text-bv-text">{group.name}</span>
          )
        )}
        {hasArgs && (
          <button
            className={`w-5.5 h-5.5 rounded flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 ${
              showProps ? 'opacity-100 bg-bv-surface-hi text-bv-text' : 'text-bv-muted hover:bg-bv-surface-hi hover:text-bv-text'
            }`}
            title="Customize props"
            onClick={(e) => { e.stopPropagation(); setShowProps(prev => !prev); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
        )}
      </div>

      {/* Props drawer — hidden until gear is clicked */}
      {showProps && hasArgs && (
        <div className="px-2.5 py-2 border-t border-bv-border bg-bv-surface" onClick={(e) => e.stopPropagation()}>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1.5">Props</div>
          <ArgsForm
            argTypes={Object.keys(argTypes).length > 0 ? argTypes : (group.argTypes ?? {})}
            args={args}
            onArgsChange={handleArgsChange}
          />
        </div>
      )}
    </li>
  );
}
