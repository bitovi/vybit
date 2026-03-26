import { toPng } from 'html-to-image';

/**
 * Returns true if all nodes share the same parentElement (are siblings).
 */
export function areSiblings(nodes: HTMLElement[]): boolean {
  if (nodes.length === 0) return false;
  const parent = nodes[0].parentElement;
  return nodes.every((n) => n.parentElement === parent);
}

/**
 * Capture a PNG of the selected sibling nodes.
 *
 * Single element: capture it directly in-place in the document.
 *   The element is already rendered; no ghost needed. Its own border/padding/margin
 *   are part of its bounding rect so they're included naturally.
 *
 * Multiple elements: clone the parent (to preserve flex/grid layout classes) but
 *   strip its padding and border so the ghost's content area starts flush at the edge,
 *   matching the union bounding box of just the selected elements.
 */
export async function captureRegion(nodes: HTMLElement[]): Promise<{ dataUrl: string; width: number; height: number }> {
  // --- Single element: capture directly in the live DOM ---
  if (nodes.length === 1) {
    const rect = nodes[0].getBoundingClientRect();
    const width  = Math.round(rect.width);
    const height = Math.round(rect.height);

    const dataUrl = await toPng(nodes[0], { skipFonts: true, width, height, pixelRatio: 1 });
    return { dataUrl, width, height };
  }

  // --- Multiple elements: ghost parent with padding/border stripped ---
  const parent = nodes[0].parentElement!;

  const rects  = nodes.map((n) => n.getBoundingClientRect());
  const top    = Math.min(...rects.map((r) => r.top));
  const left   = Math.min(...rects.map((r) => r.left));
  const right  = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const width  = Math.round(right - left);
  const height = Math.round(bottom - top);

  // Shallow-clone the parent so flex/grid/gap layout classes are preserved,
  // but strip its padding/border so children render flush to the ghost's edge.
  const ghost = parent.cloneNode(false) as HTMLElement;
  ghost.style.padding = '0';
  ghost.style.border = 'none';
  ghost.style.margin = '0';
  ghost.style.width = `${width}px`;

  for (const node of nodes) {
    ghost.appendChild(node.cloneNode(true));
  }

  // Must be in viewport (0,0) for html-to-image foreignObject to render correctly
  ghost.style.position = 'fixed';
  ghost.style.left = '0';
  ghost.style.top = '0';
  ghost.style.zIndex = '999999';
  ghost.style.pointerEvents = 'none';

  document.body.appendChild(ghost);

  try {
    const dataUrl = await toPng(ghost, { skipFonts: true, width, height, pixelRatio: 1 });
    return { dataUrl, width, height };
  } finally {
    ghost.remove();
  }
}
