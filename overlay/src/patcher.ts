// Patcher: applies/reverts class changes to the live DOM.
// Extracted from index.ts preview/revert logic.

let previewState: { elements: HTMLElement[]; originalClasses: string[] } | null = null;
let previewStyleEl: HTMLStyleElement | null = null;
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
    node.classList.remove(oldClass);
    node.classList.add(newClass);
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
  previewStyleEl?.remove();
  previewStyleEl = null;
}

export function getPreviewState(): { elements: HTMLElement[]; originalClasses: string[] } | null {
  return previewState;
}
