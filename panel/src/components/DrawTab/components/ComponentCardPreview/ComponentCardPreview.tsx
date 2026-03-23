import type { RefObject } from 'react';
import type { CardPhase } from '../../hooks/useComponentCardState';
import type { StoryEntry } from '../../types';
import '../../../../../../overlay/src/adaptive-iframe';

interface ComponentCardPreviewProps {
  phase: CardPhase;
  isArmed: boolean;
  error: string | null;
  cachedGhostHtml?: string;
  liveReady: boolean;
  probing: boolean;
  bestStory: StoryEntry | null;
  storyBackground?: string;
  ghostRef: RefObject<HTMLElement | null>;
}

export function ComponentCardPreview({
  phase,
  isArmed,
  error,
  cachedGhostHtml,
  liveReady,
  probing,
  bestStory,
  storyBackground,
  ghostRef,
}: ComponentCardPreviewProps) {
  const isVisible = phase !== 'idle';
  const showCachedGhost = isVisible && !error && cachedGhostHtml && !liveReady;
  const showLoading = isVisible && !error && !cachedGhostHtml && !liveReady && (probing || !!bestStory);
  const showAdaptiveIframe = isVisible && !error && !probing && bestStory;
  const showNoStories = isVisible && !error && !probing && !bestStory && !cachedGhostHtml;

  return (
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
      {showLoading && (
        <span className="text-[10px] text-bv-muted">Loading preview…</span>
      )}
      {showCachedGhost && (
        <div
          className="pointer-events-none"
          dangerouslySetInnerHTML={{ __html: cachedGhostHtml! }}
        />
      )}
      {showAdaptiveIframe && (
        // @ts-expect-error — custom element not in JSX.IntrinsicElements
        <adaptive-iframe
          ref={ghostRef}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {showNoStories && (
        <span className="text-[10px] text-bv-muted">No stories found.</span>
      )}
    </div>
  );
}
