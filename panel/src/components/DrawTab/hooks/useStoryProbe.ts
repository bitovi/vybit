import { useState, useEffect, useRef } from 'react';
import type { ArgType, StoryEntry } from '../types';

/**
 * Storybook's storyPrepared event sends argTypes with control as an object:
 *   { control: { type: 'select' }, options: [...] }
 * Our ArgType expects control as a string: { control: 'select', options: [...] }
 * This normalizes the format.
 */
function normalizeArgTypes(
  raw: Record<string, unknown>
): Record<string, ArgType> {
  const result: Record<string, ArgType> = {};
  for (const [key, rawType] of Object.entries(raw)) {
    if (!rawType || typeof rawType !== 'object') continue;
    const rt = rawType as Record<string, unknown>;
    const control = typeof rt.control === 'string'
      ? rt.control
      : typeof rt.control === 'object' && rt.control !== null
        ? (rt.control as Record<string, unknown>).type as string ?? 'text'
        : 'text';
    result[key] = {
      control,
      options: Array.isArray(rt.options) ? rt.options as string[] : undefined,
      description: typeof rt.description === 'string' ? rt.description : undefined,
      defaultValue: rt.defaultValue,
    };
  }
  return result;
}

export interface StoryProbeResult {
  bestStory: StoryEntry | null;
  probing: boolean;
  argTypes: Record<string, ArgType>;
  defaultArgs: Record<string, unknown>;
}

/**
 * Sequentially probes story iframes to find the first story that has argTypes.
 * Loads a hidden iframe for each story, listens for the `storyPrepared`
 * postMessage from Storybook, and checks whether argTypes are present.
 *
 * Returns the first story with args, or falls back to stories[0].
 */
export function useStoryProbe(stories: StoryEntry[], enabled = true): StoryProbeResult {
  const [bestStory, setBestStory] = useState<StoryEntry | null>(null);
  const [probing, setProbing] = useState(true);
  const [argTypes, setArgTypes] = useState<Record<string, ArgType>>({});
  const [defaultArgs, setDefaultArgs] = useState<Record<string, unknown>>({});

  // Track probe index in a ref so the message handler can read the latest value
  const indexRef = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (stories.length === 0) {
      setProbing(false);
      return;
    }

    resolvedRef.current = false;
    indexRef.current = 0;

    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed',
      left: '-99999px',
      top: '-99999px',
      width: '800px',
      height: '600px',
      visibility: 'hidden',
      pointerEvents: 'none',
      border: 'none',
    });
    iframeRef.current = iframe;
    document.body.appendChild(iframe);

    function loadStory(idx: number) {
      if (idx >= stories.length) {
        // None had args — fall back to first story
        if (!resolvedRef.current) {
          resolvedRef.current = true;
          setBestStory(stories[0]);
          setArgTypes({});
          setDefaultArgs({});
          setProbing(false);
        }
        return;
      }
      indexRef.current = idx;
      console.log(`[useStoryProbe] loading iframe: /storybook/iframe.html?id=${stories[idx].id}`);
      iframe.src = `/storybook/iframe.html?id=${stories[idx].id}&viewMode=story`;
    }

    // Set a per-story timeout — if storyPrepared never fires, move to next
    let storyTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleMessage(e: MessageEvent) {
      if (resolvedRef.current) return;

      let msg = e.data;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch { return; }
      }

      const currentStory = stories[indexRef.current];
      if (
        msg?.key === 'storybook-channel' &&
        msg?.event?.type === 'storyPrepared' &&
        msg?.event?.args?.[0]?.id === currentStory?.id
      ) {
        const detected = msg.event.args[0].argTypes ?? {};
        const detectedArgs = msg.event.args[0].initialArgs ?? msg.event.args[0].args ?? {};

        if (Object.keys(detected).length > 0) {
          // Found a story with args
          resolvedRef.current = true;
          setBestStory(currentStory);
          setArgTypes(normalizeArgTypes(detected));
          setDefaultArgs(detectedArgs);
          setProbing(false);
        } else {
          // No args — try next story
          if (storyTimeout) clearTimeout(storyTimeout);
          const nextIdx = indexRef.current + 1;
          storyTimeout = setTimeout(() => loadStory(nextIdx), 50);
        }
      }
    }

    window.addEventListener('message', handleMessage);

    // Also set a timeout per story in case storyPrepared never fires
    function setupStoryTimeout() {
      if (storyTimeout) clearTimeout(storyTimeout);
      storyTimeout = setTimeout(() => {
        if (!resolvedRef.current && indexRef.current < stories.length) {
          loadStory(indexRef.current + 1);
          setupStoryTimeout();
        }
      }, 5000);
    }

    iframe.addEventListener('load', () => {
      setupStoryTimeout();
    });

    console.log(`[useStoryProbe] starting probe for ${stories[0]?.id} (${stories.length} stories)`);
    // Start probing the first story
    loadStory(0);

    return () => {
      resolvedRef.current = true;
      window.removeEventListener('message', handleMessage);
      if (storyTimeout) clearTimeout(storyTimeout);
      iframe.remove();
      iframeRef.current = null;
    };
  }, [stories, enabled]);

  return { bestStory, probing, argTypes, defaultArgs };
}
