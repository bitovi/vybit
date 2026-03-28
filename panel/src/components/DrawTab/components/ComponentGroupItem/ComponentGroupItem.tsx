import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import type { ComponentGroup } from '../../types';
import { useStoryProbe } from '../../hooks/useStoryProbe';
import { useIframeSlot } from '../../hooks/useIframeQueue';
import { buildArgsUrl } from '../../hooks/useArgsUrl';
import { ArgsForm } from '../ArgsForm';
import { ComponentCardPreview } from '../ComponentCardPreview';
import { ComponentCardFooter } from '../ComponentCardFooter';
import { cardReducer, INITIAL_STATE } from '../../hooks/useComponentCardState';
import type { AdaptiveIframe } from '../../../../../../overlay/src/adaptive-iframe/adaptive-iframe';

export interface ComponentGroupItemProps {
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
  const [state, dispatch] = useReducer(cardReducer, {
    ...INITIAL_STATE,
    storyBackground: cachedStoryBackground,
  });
  const cardRef = useRef<HTMLLIElement>(null);
  const ghostRef = useRef<HTMLElement>(null);
  const initialLoadDone = useRef(false);
  const [showProps, setShowProps] = useState(false);

  // ── Phase 1: Visibility detection ──────────────────────────────────────

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          dispatch({ type: 'BECOME_VISIBLE', hasCachedGhost: !!cachedGhostHtml });
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cachedGhostHtml]);

  // ── Phase 2: Story probing ─────────────────────────────────────────────

  // Skip probing cached components until the user requests props (gear click)
  // or arms the component (loadLiveRequested).
  const probeEnabled =
    state.phase !== 'idle' &&
    (state.phase === 'probing' || !cachedGhostHtml || showProps || state.loadLiveRequested);

  const { bestStory, probing, argTypes, defaultArgs } = useStoryProbe(group.stories, probeEnabled);

  // Bridge: probe results → reducer
  useEffect(() => {
    if (!probing && bestStory && (state.phase === 'probing' || state.phase === 'cached')) {
      if (Object.keys(argTypes).length > 0) {
        dispatch({ type: 'PROBE_COMPLETE', bestStory, argTypes, defaultArgs });
      } else {
        dispatch({ type: 'PROBE_FALLBACK', bestStory });
      }
    }
  }, [probing, bestStory, argTypes, defaultArgs, state.phase]);

  // ── Phase 3: Iframe queue ──────────────────────────────────────────────

  const queueEnabled =
    state.phase === 'probe-done' &&
    !!state.bestStory &&
    (!cachedGhostHtml || state.loadLiveRequested);

  const { canLoad, releaseSlot } = useIframeSlot(queueEnabled);

  // Bridge: slot acquired → reducer
  useEffect(() => {
    if (canLoad && state.phase === 'probe-done') {
      dispatch({ type: 'SLOT_ACQUIRED' });
    }
  }, [canLoad, state.phase]);

  // ── Phase 4: Iframe src assignment ─────────────────────────────────────

  useEffect(() => {
    if (state.phase !== 'loading' || !state.bestStory || !ghostRef.current || initialLoadDone.current) return;
    initialLoadDone.current = true;
    ghostRef.current.setAttribute('src', buildArgsUrl(state.bestStory.id, {}));
  }, [state.phase, state.bestStory]);

  // ── Phase 5: Iframe events (loaded / error / ghost-extracted) ──────────

  useEffect(() => {
    const el = ghostRef.current as unknown as AdaptiveIframe | null;
    if (!el?.addEventListener) return;

    const handleLoaded = () => {
      dispatch({ type: 'IFRAME_LOADED' });
      releaseSlot();
      // Apply any args that were queued before the iframe was ready
      if (state.pendingArgs && state.bestStory) {
        if (typeof el.updateArgs === 'function') {
          el.updateArgs(state.bestStory.id, state.pendingArgs);
        }
        dispatch({ type: 'CLEAR_PENDING_ARGS' });
      }
    };
    const handleError = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail.message;
      dispatch({ type: 'IFRAME_ERROR', message: msg });
      releaseSlot();
    };
    const handleExtracted = (e: Event) => {
      const { ghostHtml, hostStyles, storyBackground: bg } = (e as CustomEvent<{
        ghostHtml: string;
        hostStyles: Record<string, string>;
        storyBackground?: string;
      }>).detail;

      if (bg) dispatch({ type: 'GHOST_EXTRACTED', storyBackground: bg });

      if (state.bestStory) {
        onGhostExtracted?.({
          storyId: state.bestStory.id,
          args: {},
          ghostHtml,
          hostStyles,
          storyBackground: bg,
          componentName: group.name,
          componentPath: group.componentPath,
        });
      }
    };

    el.addEventListener('iframe-loaded', handleLoaded);
    el.addEventListener('iframe-error', handleError as EventListener);
    el.addEventListener('ghost-extracted', handleExtracted as EventListener);
    return () => {
      el.removeEventListener('iframe-loaded', handleLoaded);
      el.removeEventListener('iframe-error', handleError as EventListener);
      el.removeEventListener('ghost-extracted', handleExtracted as EventListener);
    };
  }, [state.bestStory, state.pendingArgs, releaseSlot, group.name, group.componentPath, onGhostExtracted]);

  // ── Args changes ───────────────────────────────────────────────────────

  const handleArgsChange = useCallback((newArgs: Record<string, unknown>) => {
    dispatch({ type: 'ARGS_CHANGED', args: newArgs });

    if (!state.liveReady || !ghostRef.current || !state.bestStory) {
      // Iframe not ready — queue args and request live load
      dispatch({ type: 'REQUEST_LIVE_REFRESH' });
      return;
    }

    const el = ghostRef.current as unknown as AdaptiveIframe;
    if (typeof el.updateArgs === 'function') {
      el.updateArgs(state.bestStory.id, newArgs);
    }
  }, [state.bestStory, state.liveReady]);

  // ── Arm / disarm ───────────────────────────────────────────────────────

  const handleArmClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // prevent DrawTab's document click handler from immediately disarming
    if (isArmed) {
      onDisarm();
      return;
    }
    const el = ghostRef.current as unknown as AdaptiveIframe;
    const ghostHtml = el?.getComponentHtml?.() ?? cachedGhostHtml ?? '';
    onArm(ghostHtml, state.args);

    // Trigger a live iframe load to refresh the cache (also handles first arm for cached components).
    dispatch({ type: 'REQUEST_LIVE_REFRESH' });

    // Refresh cache immediately on arm if we already have a live ghost (captures arg tweaks).
    if (onGhostExtracted && ghostHtml && state.bestStory) {
      onGhostExtracted({
        storyId: state.bestStory.id,
        args: state.args,
        ghostHtml,
        hostStyles: cachedHostStyles ?? {},
        storyBackground: state.storyBackground,
        componentName: group.name,
        componentPath: group.componentPath,
      });
    }
  }, [isArmed, onArm, onDisarm, state.args, state.bestStory, state.storyBackground, cachedGhostHtml, cachedHostStyles, group.name, group.componentPath, onGhostExtracted]);

  // ── Derived values ─────────────────────────────────────────────────────

  // Show the gear if we have argTypes from probe, from group, or a cached ghost
  const effectiveArgTypes = Object.keys(state.argTypes).length > 0
    ? state.argTypes
    : (group.argTypes ?? {});
  const hasArgs = Object.keys(effectiveArgTypes).length > 0 || !!cachedGhostHtml;

  // ── Render ─────────────────────────────────────────────────────────────

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
      <ComponentCardPreview
        phase={state.phase}
        isArmed={isArmed}
        error={state.error}
        cachedGhostHtml={cachedGhostHtml}
        liveReady={state.liveReady}
        probing={probing && probeEnabled}
        bestStory={state.bestStory ?? bestStory}
        storyBackground={state.storyBackground}
        ghostRef={ghostRef}
      />

      <ComponentCardFooter
        isArmed={isArmed}
        group={group}
        hasArgs={hasArgs}
        showProps={showProps}
        onToggleProps={() => setShowProps(prev => !prev)}
      />

      {/* Props drawer — hidden until gear is clicked */}
      {showProps && hasArgs && (
        <div className="px-2.5 py-2 border-t border-bv-border bg-bv-surface" onClick={(e) => e.stopPropagation()}>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1.5">Props</div>
          <ArgsForm
            argTypes={effectiveArgTypes}
            args={state.args}
            onArgsChange={handleArgsChange}
          />
        </div>
      )}
    </li>
  );
}
