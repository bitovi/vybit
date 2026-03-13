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

/** Walk .return up the fiber tree to find the nearest function/class component */
export function findComponentBoundary(fiber: any): ComponentInfo | null {
  let current = fiber.return;
  while (current) {
    if (typeof current.type === 'function') {
      return {
        componentType: current.type,
        componentName:
          current.type.displayName || current.type.name || 'Unknown',
        componentFiber: current,
      };
    }
    current = current.return;
  }
  return null;
}

/** Find the root fiber from common root container elements */
export function getRootFiber(): any | null {
  const candidateIds = ['root', 'app', '__next'];
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
