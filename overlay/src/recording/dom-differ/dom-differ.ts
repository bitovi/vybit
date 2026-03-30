import { createPatch, applyPatch } from 'diff';

/** Threshold: if diff size > this fraction of full DOM, auto-promote to keyframe */
const KEYFRAME_THRESHOLD = 0.5;
/** Minimum DOM size (bytes) before adaptive diffing kicks in. Below this, always use diffs. */
const MIN_DOM_SIZE_FOR_ADAPTIVE = 500;

export interface DiffResult {
  /** Whether this should be stored as a keyframe (full DOM) */
  isKeyframe: boolean;
  /** Full DOM string (present when isKeyframe === true) */
  fullDom?: string;
  /** Unified diff string (present when isKeyframe === false) */
  diff?: string;
}

/**
 * Compares DOM snapshots using jsdiff and decides whether to store
 * a full keyframe or a compact diff.
 */
export class DomDiffer {
  private lastFullDom: string | null = null;

  /**
   * Compare a new DOM snapshot against the last known full DOM.
   * Returns a DiffResult indicating keyframe or diff.
   *
   * @param currentDom - The current full document.documentElement.outerHTML
   * @param forceKeyframe - Force this to be a keyframe (e.g., page-load, navigation)
   */
  computeDiff(currentDom: string, forceKeyframe = false): DiffResult {
    if (forceKeyframe || this.lastFullDom === null) {
      this.lastFullDom = currentDom;
      return { isKeyframe: true, fullDom: currentDom };
    }

    const patch = createPatch('dom', this.lastFullDom, currentDom, '', '', { context: 3 });

    // Only auto-promote to keyframe for large DOMs where the diff is proportionally huge.
    // For small DOMs, always prefer diff (patch header overhead would skew the ratio).
    if (currentDom.length >= MIN_DOM_SIZE_FOR_ADAPTIVE && patch.length > currentDom.length * KEYFRAME_THRESHOLD) {
      this.lastFullDom = currentDom;
      return { isKeyframe: true, fullDom: currentDom };
    }

    this.lastFullDom = currentDom;
    return { isKeyframe: false, diff: patch };
  }

  /**
   * Reconstruct full DOM from a base keyframe and a sequence of diffs.
   * Applies patches sequentially.
   */
  static reconstructDom(baseDom: string, diffs: string[]): string {
    let current = baseDom;
    for (const diff of diffs) {
      const result = applyPatch(current, diff);
      if (result === false) {
        throw new Error('Failed to apply DOM diff — patch mismatch');
      }
      current = result;
    }
    return current;
  }

  /**
   * Reset internal state (e.g., after a page navigation).
   */
  reset(): void {
    this.lastFullDom = null;
  }

  /**
   * Set the last known full DOM directly (e.g., when resuming from IndexedDB).
   */
  setBaseline(dom: string): void {
    this.lastFullDom = dom;
  }
}
