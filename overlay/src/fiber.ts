// React fiber tree walking utilities

export interface ComponentInfo {
  componentType: any;
  componentName: string;
  componentFiber: any;
}

export interface InstanceMatch {
  fiber: any;
  domNode: HTMLElement | null;
}

/** Get the React fiber attached to a DOM node */
export function getFiber(domNode: Element): any | null {
  const key = Object.keys(domNode).find((k) => k.startsWith('__reactFiber$'));
  return key ? (domNode as any)[key] : null;
}

const REACT_FORWARD_REF = Symbol.for('react.forward_ref');
const REACT_MEMO = Symbol.for('react.memo');

/** Walk .return up the fiber tree to find the nearest function/class component.
 *  Handles plain functions, forwardRef, and memo wrappers. */
export function findComponentBoundary(fiber: any): ComponentInfo | null {
  let current = fiber.return;
  while (current) {
    const t = current.type;
    if (typeof t === 'function') {
      return {
        componentType: t,
        componentName: t.displayName || t.name || 'Unknown',
        componentFiber: current,
      };
    }
    // forwardRef: { $$typeof: Symbol(react.forward_ref), render: fn }
    if (t && t.$$typeof === REACT_FORWARD_REF) {
      const name = t.displayName || t.render?.displayName || t.render?.name || 'Unknown';
      return { componentType: t, componentName: name, componentFiber: current };
    }
    // memo: { $$typeof: Symbol(react.memo), type: fn | forwardRef }
    if (t && t.$$typeof === REACT_MEMO) {
      const inner = t.type;
      const name =
        t.displayName ||
        (typeof inner === 'function' ? inner.displayName || inner.name : null) ||
        (inner?.$$typeof === REACT_FORWARD_REF ? inner.displayName || inner.render?.name : null) ||
        'Unknown';
      return { componentType: t, componentName: name, componentFiber: current };
    }
    current = current.return;
  }
  return null;
}

/**
 * Walk up a fiber's .return chain to reach the HostRoot (tag === 3).
 * This is reliable regardless of DOM container IDs (works in Storybook, Next.js, Vite, etc.)
 */
export function getRootFiberFrom(fiber: any): any | null {
  let current = fiber;
  while (current) {
    if (current.tag === 3) return current; // HostRoot
    if (!current.return) return current;   // topmost fiber if no HostRoot found
    current = current.return;
  }
  return null;
}

/** Find the root fiber — tries DOM container IDs first, falls back to document scan */
export function getRootFiber(): any | null {
  const candidateIds = ['root', 'app', '__next', 'storybook-root', 'sb-root'];
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    const key = Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
    if (key) {
      const container = (el as any)[key];
      // React 18: __reactContainer$ returns an alternate fiber whose .child is null.
      // The actual tree lives at stateNode.current.
      if (container?.stateNode?.current) {
        return container.stateNode.current;
      }
      return container;
    }
  }

  // Fallback: try data-reactroot attribute
  const reactRoot = document.querySelector('[data-reactroot]');
  if (reactRoot) {
    return getFiber(reactRoot);
  }

  return null;
}

/** DFS to find all fibers matching a given component type */
export function findAllInstances(rootFiber: any, componentType: any): any[] {
  const results: any[] = [];

  function walk(fiber: any): void {
    if (!fiber) return;
    if (fiber.type === componentType) {
      results.push(fiber);
    }
    walk(fiber.child);
    walk(fiber.sibling);
  }

  walk(rootFiber);
  return results;
}

/**
 * Build a human-readable structural path label from a target fiber up to the component boundary.
 * Example output: `Button > button[0] > span[0]`
 * Returns `{ label, path }` where path is the numeric child-index array.
 */
export function buildPathLabel(
  targetFiber: any,
  boundary: ComponentInfo,
): { label: string; path: number[] } {
  const path = getChildPath(boundary.componentFiber, targetFiber);

  // Walk from component boundary down to target, collecting tag names
  const segments: string[] = [boundary.componentName];
  let current = boundary.componentFiber;
  for (const index of path) {
    current = current.child;
    if (!current) break;
    for (let i = 0; i < index; i++) {
      if (!current) break;
      current = current.sibling;
    }
    if (!current) break;
    // Use the tag name (for host elements) or component name
    const tag = typeof current.type === 'string'
      ? current.type
      : current.type?.displayName || current.type?.name || '?';
    segments.push(`${tag}[${index}]`);
  }

  return { label: segments.join(' > '), path };
}

/**
 * Compute the child-index path from componentFiber down to targetFiber.
 * Walk from targetFiber up via .return, recording the sibling index at each level.
 */
export function getChildPath(
  componentFiber: any,
  targetFiber: any,
): number[] {
  const path: number[] = [];
  let current = targetFiber;

  while (current && current !== componentFiber) {
    const parent = current.return;
    if (!parent) break;

    // Count sibling index: walk from parent.child via .sibling
    let index = 0;
    let sibling = parent.child;
    while (sibling && sibling !== current) {
      sibling = sibling.sibling;
      index++;
    }
    path.push(index);

    current = parent;
  }

  path.reverse();
  return path;
}

/**
 * Follow a child-index path from instanceFiber to reach the equivalent DOM node.
 */
export function resolvePathToDOM(
  instanceFiber: any,
  path: number[],
): HTMLElement | null {
  let current = instanceFiber;

  for (const index of path) {
    if (!current) return null;
    current = current.child;
    if (!current) return null;
    for (let i = 0; i < index; i++) {
      if (!current) return null;
      current = current.sibling;
    }
  }

  if (!current) return null;
  return getDOMNode(current);
}

/** Get the DOM node for a fiber: stateNode if HostComponent, or walk children */
export function getDOMNode(fiber: any): HTMLElement | null {
  if (fiber.stateNode instanceof HTMLElement) {
    return fiber.stateNode;
  }

  let child = fiber.child;
  while (child) {
    if (child.tag === 5 && child.stateNode instanceof HTMLElement) {
      return child.stateNode;
    }
    const result = getDOMNode(child);
    if (result) return result;
    child = child.sibling;
  }

  return null;
}

/**
 * Given a container DOM node and a clicked descendant, find the equivalent descendant
 * inside `container` by matching tag name and className down the ancestor chain from
 * `clicked` up to `containerNode`. This is used instead of a fiber index path so that
 * structural variation between siblings (e.g. a conditional badge) doesn't cause a
 * wrong-node or null result.
 */
function findEquivalentDescendant(
  container: HTMLElement,
  clicked: HTMLElement,
  containerNode: HTMLElement,
): HTMLElement | null {
  // Build the ancestor chain from clicked up to (but not including) containerNode
  const chain: HTMLElement[] = [];
  let el: HTMLElement | null = clicked;
  while (el && el !== containerNode) {
    chain.unshift(el);
    el = el.parentElement;
  }
  if (chain.length === 0) return container; // clicked IS the container node

  // Walk down the chain inside `container`, matching by tag+className at each step
  let node: HTMLElement = container;
  for (const ancestor of chain) {
    const match = Array.from(node.children).find(
      (c): c is HTMLElement =>
        c instanceof HTMLElement &&
        c.tagName === ancestor.tagName &&
        c.className === ancestor.className,
    ) ?? null;
    if (!match) return null;
    node = match;
  }
  return node;
}

/**
 * Fallback for elements rendered inline via .map() without their own component boundary.
 * Walks up the fiber tree from targetFiber (stopping at boundaryFiber) to find the level
 * with the most same-type fiber siblings that passes the confidence check.
 *
 * Depth fix: once the repeating container level is found, each sibling's equivalent
 * descendant is found by tag+className descent from the clicked element's ancestor chain —
 * not by fiber index path — so structural variation across siblings doesn't cause mismatches.
 *
 * Confidence check: at most 1 sibling may have a differing className at the container
 * level (the "active" item). Any more outliers indicates a non-repeating structure.
 */
export function findInlineRepeatedNodes(
  targetFiber: any,
  boundaryFiber: any,
  minSiblings = 3,
): HTMLElement[] {
  // The actual DOM node that was clicked
  const clickedNode = getDOMNode(targetFiber);
  if (!clickedNode) return [];

  let current: any = targetFiber;
  let bestResult: HTMLElement[] = [];

  while (current && current !== boundaryFiber) {
    const parent = current.return;
    if (!parent) break;

    // Collect same-type fiber siblings at this level
    const sameType: any[] = [];
    let child = parent.child;
    while (child) {
      if (child.type === current.type) {
        sameType.push(child);
      }
      child = child.sibling;
    }

    if (sameType.length >= minSiblings && sameType.length > bestResult.length) {
      // Get the container DOM node for this fiber level
      const containerNode = getDOMNode(current);
      if (!containerNode) {
        current = parent;
        continue;
      }

      // Collect container DOM nodes for all same-type siblings
      const containerNodes: HTMLElement[] = [];
      for (const sib of sameType) {
        const node = getDOMNode(sib);
        if (node) containerNodes.push(node);
      }

      // Confidence check: at most 1 container node may have a differing className
      // (the active/selected item). More than 1 outlier = not a uniform repeated list.
      const majorityClass = containerNodes
        .map(n => n.className)
        .sort((a, b) =>
          containerNodes.filter(n => n.className === b).length -
          containerNodes.filter(n => n.className === a).length
        )[0];
      const outliers = containerNodes.filter(n => n.className !== majorityClass);
      if (outliers.length > 1) {
        current = parent;
        continue;
      }

      // For each sibling container, find the equivalent descendant by tag+className
      // descent from the clicked node's ancestor chain — immune to index-path divergence.
      const results: HTMLElement[] = [];
      for (const sibContainer of containerNodes) {
        const equiv = findEquivalentDescendant(sibContainer, clickedNode, containerNode);
        if (equiv) results.push(equiv);
      }

      if (results.length > bestResult.length) {
        bestResult = results;
      }
    }

    current = parent;
  }

  return bestResult;
}

/**
 * For non-React (plain HTML / Astro) pages: find all elements with the same tag name
 * and exact className as the clicked element.
 *
 * If the element has no classes, or only one element has those classes, returns [el] alone.
 *
 * Outlier tolerance (for "active" items): if clicking the parent of the matched elements,
 * also check whether siblings share a majority class with ≤1 outlier — but only among
 * the direct siblings of the clicked element, not the entire document.
 */
export function findDOMEquivalents(el: HTMLElement): HTMLElement[] {
  const classes = typeof el.className === 'string' ? el.className.trim() : '';
  if (!classes) return [el];

  // Primary: exact tagName + className match across the whole document
  const exactMatches = Array.from(
    document.querySelectorAll<HTMLElement>(el.tagName.toLowerCase()),
  ).filter((n) => n.className === el.className);

  if (exactMatches.length >= 2) return exactMatches;

  // Fallback: majority-class among direct siblings, tolerating ≤1 outlier (e.g. active link).
  // This lets clicking a non-active nav link select all sibling nav links.
  const parent = el.parentElement;
  if (!parent) return [el];

  const siblings = Array.from(parent.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.tagName === el.tagName,
  );
  if (siblings.length < 2) return [el];

  const majorityClass = siblings
    .map((n) => n.className)
    .sort(
      (a, b) =>
        siblings.filter((n) => n.className === b).length -
        siblings.filter((n) => n.className === a).length,
    )[0];

  const outliers = siblings.filter((n) => n.className !== majorityClass);
  if (outliers.length > 1) return [el];

  return siblings.filter((n) => n.className === majorityClass);
}
