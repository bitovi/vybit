import type { SnapshotTrigger, DomChange } from '../../../../shared/types';
import { getFiber, findComponentBoundary } from '../../fiber';

const MUTATION_DEBOUNCE_MS = 500;
const SHADOW_HOST_ID = 'tw-visual-editor-host';

export type SnapshotCallback = (
  trigger: SnapshotTrigger,
  elementInfo?: { tag: string; classes: string; id?: string; innerText?: string; componentName?: string },
  domChanges?: DomChange[],
) => void;

export interface EventCaptureHandle {
  /** Suppress the next MutationObserver callback (e.g., after a navigation snapshot). */
  suppressNext(): void;
  /** Stop all capturing — disconnects observer, removes all listeners. */
  teardown(): void;
}

/**
 * Start listening for MutationObserver, click, and error events that trigger recording snapshots.
 * Returns a handle with suppressNext/teardown.
 *
 * Usage:
 *   const events = createEventCapture(onSnapshot);
 *   // ... later ...
 *   events.suppressNext(); // skip next mutation (e.g. after nav)
 *   events.teardown();
 */
export function createEventCapture(onSnapshot: SnapshotCallback, options?: { isClickSuppressed?: () => boolean }): EventCaptureHandle {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressNextMutation = false;
  let pendingMutations: MutationRecord[] = [];

  // MutationObserver
  const observer = new MutationObserver((mutations: MutationRecord[]) => {
    const relevant = mutations.filter(m => !isVyBitElement(m.target));
    if (relevant.length === 0) return;

    if (suppressNextMutation) {
      suppressNextMutation = false;
      return;
    }

    pendingMutations.push(...relevant);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const domChanges = extractDomChanges(pendingMutations);
      pendingMutations = [];
      onSnapshot('mutation', undefined, domChanges);
    }, MUTATION_DEBOUNCE_MS);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  // Click listener
  const clickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (isVyBitElement(target)) return;
    if (options?.isClickSuppressed?.()) return;
    onSnapshot('click', extractElementInfo(target));
  };
  window.addEventListener('click', clickHandler, true);

  // Error listeners
  const errorHandler = () => { onSnapshot('error'); };
  window.addEventListener('error', errorHandler);

  const rejectionHandler = () => { onSnapshot('error'); };
  window.addEventListener('unhandledrejection', rejectionHandler);

  return {
    suppressNext() {
      suppressNextMutation = true;
    },
    teardown() {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('click', clickHandler, true);
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    },
  };
}

function isVyBitElement(el: Node): boolean {
  if ('id' in el && (el as HTMLElement).id === SHADOW_HOST_ID) return true;

  if (typeof el.getRootNode === 'function') {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot && (root.host as HTMLElement).id === SHADOW_HOST_ID) return true;
  }

  let parent = el.parentElement;
  while (parent) {
    if (parent.id === SHADOW_HOST_ID) return true;
    if (typeof parent.getRootNode === 'function') {
      const root = parent.getRootNode();
      if (root instanceof ShadowRoot && (root.host as HTMLElement).id === SHADOW_HOST_ID) return true;
    }
    parent = parent.parentElement;
  }

  return false;
}

function extractElementInfo(el: HTMLElement): { tag: string; classes: string; id?: string; innerText?: string; componentName?: string } {
  const fiber = getFiber(el);
  const boundary = fiber ? findComponentBoundary(fiber) : null;
  return {
    tag: el.tagName.toLowerCase(),
    classes: el.className || '',
    id: el.id || undefined,
    innerText: el.innerText?.slice(0, 200) || undefined,
    componentName: boundary?.componentName || undefined,
  };
}

function buildSelectorPath(el: Node): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
    } else if (current.className && typeof current.className === 'string') {
      const cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) selector += `.${cls}`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ') || 'unknown';
}

function getComponentName(el: Node): string | undefined {
  const htmlEl = el instanceof HTMLElement ? el : el.parentElement;
  if (!htmlEl) return undefined;
  const fiber = getFiber(htmlEl);
  const boundary = fiber ? findComponentBoundary(fiber) : null;
  return boundary?.componentName || undefined;
}

function extractDomChanges(mutations: MutationRecord[]): DomChange[] {
  const changes: DomChange[] = [];
  const seen = new Set<string>();

  for (const m of mutations) {
    const selector = buildSelectorPath(m.target);
    const componentName = getComponentName(m.target);

    if (m.type === 'attributes' && m.attributeName) {
      const key = `attr:${selector}:${m.attributeName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const el = m.target as HTMLElement;
      changes.push({
        type: 'attribute',
        selector,
        componentName,
        attributeName: m.attributeName,
        oldValue: m.oldValue ?? undefined,
        newValue: el.getAttribute(m.attributeName) ?? undefined,
      });
    } else if (m.type === 'characterData') {
      const key = `text:${selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push({
        type: 'text',
        selector,
        componentName,
        oldText: m.oldValue?.slice(0, 500) ?? undefined,
        newText: m.target.textContent?.slice(0, 500) ?? undefined,
      });
    } else if (m.type === 'childList') {
      const key = `child:${selector}`;
      if (seen.has(key)) {
        // Merge counts into existing entry
        const existing = changes.find(c => c.type === 'childList' && c.selector === selector);
        if (existing) {
          existing.addedCount = (existing.addedCount ?? 0) + m.addedNodes.length;
          existing.removedCount = (existing.removedCount ?? 0) + m.removedNodes.length;
        }
        continue;
      }
      seen.add(key);
      const addedHTML = Array.from(m.addedNodes)
        .filter(n => !isVyBitElement(n))
        .map(n => n instanceof HTMLElement ? n.outerHTML : n.textContent ?? '')
        .join('')
        .slice(0, 1000);
      const removedHTML = Array.from(m.removedNodes)
        .filter(n => !isVyBitElement(n))
        .map(n => n instanceof HTMLElement ? n.outerHTML : n.textContent ?? '')
        .join('')
        .slice(0, 1000);
      changes.push({
        type: 'childList',
        selector,
        componentName,
        addedCount: m.addedNodes.length,
        removedCount: m.removedNodes.length,
        addedHTML: addedHTML || undefined,
        removedHTML: removedHTML || undefined,
      });
    }
  }
  return changes;
}
