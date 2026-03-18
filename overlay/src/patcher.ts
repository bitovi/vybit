// Patcher: applies/reverts class changes to the live DOM.
// Extracted from index.ts preview/revert logic.

let previewState: { elements: HTMLElement[]; originalClasses: string[] } | null = null;
let previewStyleEl: HTMLStyleElement | null = null;
/** Accumulates CSS for committed/staged classes so revertPreview() never strips it. */
let committedStyleEl: HTMLStyleElement | null = null;
let previewGeneration = 0;

export async function applyPreview(
  elements: HTMLElement[],
  oldClass: string,
  newClass: string,
  serverOrigin: string,
): Promise<void> {
  // Bump generation so any in-flight preview from a previous call is ignored.
  const gen = ++previewGeneration;

  // Save original state on first preview
  if (!previewState) {
    previewState = {
      elements,
      originalClasses: elements.map(n => n.className),
    };
  }

  // Fetch generated CSS for newClass from the MCP server and inject into
  // document.head so the class has styles even if purged from the user's build.
  if (newClass) {
    try {
      const res = await fetch(`${serverOrigin}/css`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: [newClass] }),
      });
      // If a revert (or newer preview) happened while we were fetching, bail out.
      if (gen !== previewGeneration) return;
      const { css } = await res.json() as { css: string };
      if (gen !== previewGeneration) return;
      if (!previewStyleEl) {
        previewStyleEl = document.createElement('style');
        previewStyleEl.setAttribute('data-tw-preview', '');
        document.head.appendChild(previewStyleEl);
      }
      previewStyleEl.textContent = css;
    } catch {
      // If the server is unavailable, apply the class anyway — it may already exist in the build
    }
  }

  // One more staleness check before mutating the DOM.
  if (gen !== previewGeneration) return;

  // Restore original classes before applying new swap to avoid accumulation
  if (previewState) {
    for (let i = 0; i < previewState.elements.length; i++) {
      previewState.elements[i].className = previewState.originalClasses[i];
    }
  }

  // Apply class swap to all equivalent nodes
  for (const node of elements) {
    if (oldClass) node.classList.remove(oldClass);
    if (newClass) node.classList.add(newClass);
  }
}

export function revertPreview(): void {
  // Invalidate any in-flight applyPreview so it won't apply after this revert.
  previewGeneration++;

  if (previewState) {
    for (let i = 0; i < previewState.elements.length; i++) {
      previewState.elements[i].className = previewState.originalClasses[i];
    }
    previewState = null;
  }
  // Only remove the active preview style — committedStyleEl is intentionally preserved.
  previewStyleEl?.remove();
  previewStyleEl = null;
}

export function getPreviewState(): { elements: HTMLElement[]; originalClasses: string[] } | null {
  return previewState;
}

/**
 * Clear preview tracking without reverting DOM changes (the staged change is now the baseline).
 * Graduates the preview CSS into committedStyleEl so subsequent revertPreview() calls
 * don't strip CSS that was injected for previously staged classes.
 */
export function commitPreview(): void {
  previewGeneration++;
  previewState = null;

  // Move staged CSS from the transient preview element into the persistent committed bucket.
  if (previewStyleEl) {
    const css = previewStyleEl.textContent || '';
    if (css) {
      if (!committedStyleEl) {
        committedStyleEl = document.createElement('style');
        committedStyleEl.setAttribute('data-tw-committed', '');
        document.head.appendChild(committedStyleEl);
      }
      committedStyleEl.textContent += css;
    }
    previewStyleEl.remove();
    previewStyleEl = null;
  }
}
