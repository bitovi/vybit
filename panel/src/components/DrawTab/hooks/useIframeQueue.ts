import { useEffect, useRef, useState, useCallback } from 'react';

/** Maximum number of adaptive iframes that may load simultaneously. Adjustable at runtime. */
export let IFRAME_QUEUE_CONCURRENCY = 2;

// Module-level singleton — shared across all ComponentGroupItem instances.
let running = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<() => void> {
  return new Promise(resolve => {
    const attempt = () => {
      if (running < IFRAME_QUEUE_CONCURRENCY) {
        running++;
        resolve(releaseSlotInternal);
      } else {
        waiters.push(attempt);
      }
    };
    attempt();
  });
}

function releaseSlotInternal() {
  running = Math.max(0, running - 1);
  const next = waiters.shift();
  next?.();
}

/**
 * Acquires a slot in the global iframe load queue when `enabled` becomes true.
 * Returns `{ canLoad, releaseSlot }`.
 *
 * - `canLoad` is true once a slot is granted (stays true after release so the
 *   rendered preview remains visible after loading finishes).
 * - Call `releaseSlot()` when the iframe finishes loading (success or error).
 */
export function useIframeSlot(enabled: boolean): { canLoad: boolean; releaseSlot: () => void } {
  const [canLoad, setCanLoad] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);
  // One-way latch: once we've entered the queue, don't re-enter on re-renders.
  const enqueuedRef = useRef(false);

  useEffect(() => {
    if (!enabled || enqueuedRef.current) return;
    enqueuedRef.current = true;

    let cancelled = false;
    acquireSlot().then(releaseFn => {
      if (cancelled) { releaseFn(); return; }
      releaseRef.current = releaseFn;
      setCanLoad(true);
    });

    return () => {
      cancelled = true;
      // Release slot if the component unmounts while still loading.
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [enabled]);

  const releaseSlot = useCallback(() => {
    if (releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
      // Don't set canLoad = false — the preview should stay visible after loading.
    }
  }, []);

  return { canLoad, releaseSlot };
}
