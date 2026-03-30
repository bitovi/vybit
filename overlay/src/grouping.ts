// Element grouping logic for the selection redux.
// Groups elements by className diff relative to a clicked element.

import {
  getFiber,
  findComponentBoundary,
  getRootFiber,
  getRootFiberFrom,
  findAllInstances,
  getDOMNode,
  getChildPath,
  resolvePathToDOM,
  buildPathLabel,
} from './fiber';

export interface ElementGroup {
  label: string;         // e.g. "+e" or "-a +f"
  added: string[];       // classes added vs clicked element
  removed: string[];     // classes removed vs clicked element
  elements: HTMLElement[];
}

export interface GroupingResult {
  exactMatch: HTMLElement[];
  nearGroups: ElementGroup[];
  componentName: string | null;
}

/**
 * CSS-escape a class name for use in a selector.
 * Handles Tailwind's special chars like `.`, `/`, `[`, `]`, `:`, etc.
 */
function cssEscape(cls: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(cls);
  // Fallback: escape anything that isn't alphanumeric, hyphen, or underscore
  return cls.replace(/([^\w-])/g, '\\$1');
}

/**
 * Build a CSS selector for a tag with the given classes.
 */
function buildSelector(tag: string, classes: string[]): string {
  return tag.toLowerCase() + classes.map(c => `.${cssEscape(c)}`).join('');
}

/**
 * Parse className string into a sorted array of individual classes.
 */
function parseClassList(className: string): string[] {
  if (typeof className !== 'string') return [];
  return className.trim().split(/\s+/).filter(Boolean).sort();
}

/**
 * Compute the diff signature for a candidate element vs the reference classes.
 */
function classDiff(refClasses: Set<string>, candidateClasses: Set<string>): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const c of candidateClasses) {
    if (!refClasses.has(c)) added.push(c);
  }
  for (const c of refClasses) {
    if (!candidateClasses.has(c)) removed.push(c);
  }
  added.sort();
  removed.sort();
  return { added, removed };
}

/**
 * Build a label from a diff: "+foo +bar -baz"
 */
function diffLabel(added: string[], removed: string[]): string {
  const parts: string[] = [];
  for (const a of added) parts.push(`+${a}`);
  for (const r of removed) parts.push(`-${r}`);
  return parts.join(' ');
}

/** Max total diff (added + removed) to include in near groups */
const MAX_DIFF = 10;

/** Cap on candidate elements collected during page-wide scan */
const MAX_CANDIDATES = 200;

/**
 * Step 1: Find exact-match elements (same tag + identical className).
 * For React pages, scopes to component instances.
 * For non-React pages, scans the whole document.
 */
export function findExactMatches(
  clickedEl: HTMLElement,
  shadowHost: HTMLElement | null,
): GroupingResult {
  const classes = parseClassList(typeof clickedEl.className === 'string' ? clickedEl.className : '');
  const tag = clickedEl.tagName;

  // Determine React component scope
  const fiber = getFiber(clickedEl);
  const boundary = fiber ? findComponentBoundary(fiber) : null;
  const componentName = boundary?.componentName ?? null;
  let exactMatches: HTMLElement[];

  if (boundary) {
    // React scoped: collect all DOM nodes from all component instances, filter to exact match
    const rootFiber = getRootFiberFrom(boundary.componentFiber) ?? getRootFiber();
    const allNodes = rootFiber
      ? collectComponentDOMNodes(rootFiber, boundary.componentType, tag)
      : [];
    exactMatches = allNodes.filter(
      (n) => n.tagName === tag && n.className === clickedEl.className,
    );
  } else {
    // Non-React / page-wide scan
    if (classes.length === 0) {
      // No classes — just match by tag, but only exact (no className)
      exactMatches = Array.from(
        document.querySelectorAll<HTMLElement>(tag.toLowerCase()),
      ).filter(
        (n) => (typeof n.className === 'string' ? n.className.trim() : '') === '' && !isInShadowHost(n, shadowHost),
      );
    } else {
      const selector = buildSelector(tag, classes);
      exactMatches = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      ).filter(
        (n) => n.className === clickedEl.className && !isInShadowHost(n, shadowHost),
      );
    }
  }

  // Ensure the clicked element is included
  if (!exactMatches.includes(clickedEl)) {
    exactMatches.unshift(clickedEl);
  }

  return {
    exactMatch: exactMatches,
    nearGroups: [], // Not computed yet — lazy
    componentName,
  };
}

/**
 * Step 2/2B/3: Compute near groups (class-diff groups) for the clicked element.
 * Called lazily when the user clicks the "+ ▼" button.
 */
export function computeNearGroups(
  clickedEl: HTMLElement,
  exactMatchSet: Set<HTMLElement>,
  shadowHost: HTMLElement | null,
): ElementGroup[] {
  const rawClassName = typeof clickedEl.className === 'string' ? clickedEl.className : '';
  const classes = parseClassList(rawClassName);
  const tag = clickedEl.tagName;
  const refSet = new Set(classes);

  if (classes.length === 0) return [];

  // Determine scope
  const fiber = getFiber(clickedEl);
  const boundary = fiber ? findComponentBoundary(fiber) : null;

  let candidates: HTMLElement[];

  if (boundary) {
    // React scoped
    const rootFiber = getRootFiberFrom(boundary.componentFiber) ?? getRootFiber();
    candidates = rootFiber
      ? collectComponentDOMNodes(rootFiber, boundary.componentType, tag)
      : [];
    // Remove exact matches
    candidates = candidates.filter((n) => !exactMatchSet.has(n));
    console.log('[grouping] React path — component:', boundary.componentName, 'tag:', tag, 'candidates:', candidates.length, candidates.map(n => n.className.split(' ')[0]));
  } else {
    // Page-wide scan: one query per class (O(N) instead of O(N²)).
    // Unions all matching elements, then diff-filters post-query.
    // Finds supersets, drop-k of any depth, and added-only variants.
    const seen = new Set<HTMLElement>(exactMatchSet);
    candidates = [];

    for (const cls of classes) {
      const sel = `${tag.toLowerCase()}.${cssEscape(cls)}`;
      for (const n of document.querySelectorAll<HTMLElement>(sel)) {
        if (!seen.has(n) && !isInShadowHost(n, shadowHost)) {
          seen.add(n);
          candidates.push(n);
          if (candidates.length >= MAX_CANDIDATES) break;
        }
      }
      if (candidates.length >= MAX_CANDIDATES) break;
    }
    console.log('[grouping] Non-React path — tag:', tag, 'candidates:', candidates.length);
  }

  // Group by diff signature
  const groupMap = new Map<string, { added: string[]; removed: string[]; elements: HTMLElement[] }>();

  for (const el of candidates) {
    const candidateClasses = new Set(parseClassList(typeof el.className === 'string' ? el.className : ''));
    const { added, removed } = classDiff(refSet, candidateClasses);
    const totalDiff = added.length + removed.length;
    console.log('[grouping] candidate diff:', totalDiff, 'added:', added.length, 'removed:', removed.length, 'class0:', el.className.split(' ')[0]);
    if (totalDiff === 0 || totalDiff > MAX_DIFF) continue;

    const key = `+${added.join(',')}|-${removed.join(',')}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.elements.push(el);
    } else {
      groupMap.set(key, { added, removed, elements: [el] });
    }
  }

  // Sort by total diff size, then by element count descending
  const groups: ElementGroup[] = [];
  for (const [, g] of groupMap) {
    groups.push({
      label: diffLabel(g.added, g.removed),
      added: g.added,
      removed: g.removed,
      elements: g.elements,
    });
  }
  groups.sort((a, b) => {
    const diffA = a.added.length + a.removed.length;
    const diffB = b.added.length + b.removed.length;
    if (diffA !== diffB) return diffA - diffB;
    return b.elements.length - a.elements.length;
  });

  return groups;
}

/**
 * Collect all DOM nodes of a given tagName from all instances of a component type.
 */
function collectComponentDOMNodes(
  rootFiber: any,
  componentType: any,
  tagName: string,
): HTMLElement[] {
  const instances = findAllInstances(rootFiber, componentType);
  const results: HTMLElement[] = [];
  for (const inst of instances) {
    // Start from inst.child to avoid following inst.sibling (which leaks
    // into sibling component instances outside this component's subtree).
    collectHostNodes(inst.child, tagName, results);
  }
  return results;
}

/**
 * DFS a fiber subtree collecting DOM nodes (HostComponent, tag === 5) matching tagName.
 */
function collectHostNodes(fiber: any, tagName: string, out: HTMLElement[]): void {
  if (!fiber) return;
  if (fiber.tag === 5 && fiber.stateNode instanceof HTMLElement) {
    if (fiber.stateNode.tagName === tagName) {
      out.push(fiber.stateNode);
    }
  }
  collectHostNodes(fiber.child, tagName, out);
  collectHostNodes(fiber.sibling, tagName, out);
}

function isInShadowHost(el: HTMLElement, shadowHost: HTMLElement | null): boolean {
  if (!shadowHost) return false;
  return shadowHost.contains(el);
}

export interface PathMatchResult {
  elements: HTMLElement[];
  label: string;
}

/**
 * Find all elements at the same structural position (child-index path) across
 * all instances of the same React component. Returns null for non-React elements.
 */
export function findSamePathElements(
  clickedEl: HTMLElement,
): PathMatchResult | null {
  const fiber = getFiber(clickedEl);
  if (!fiber) return null;

  const boundary = findComponentBoundary(fiber);
  if (!boundary) return null;

  const { label, path } = buildPathLabel(fiber, boundary);

  const rootFiber = getRootFiberFrom(boundary.componentFiber) ?? getRootFiber();
  if (!rootFiber) return null;

  const instances = findAllInstances(rootFiber, boundary.componentType);
  const elements: HTMLElement[] = [];

  for (const inst of instances) {
    const node = resolvePathToDOM(inst, path);
    if (node && !elements.includes(node)) {
      elements.push(node);
    }
  }

  return elements.length > 0 ? { elements, label } : null;
}
