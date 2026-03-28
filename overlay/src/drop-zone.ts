// Drop-zone tracking system for component arm-and-place.
// Runs in the overlay (vanilla DOM — no React).
// Click-to-arm: user arms a component in the panel, then clicks in the app to place it.
// Shows a floating cursor label and teal drop indicator while armed.

import { send, sendTo } from './ws';
import { buildContext } from './context';
import { getFiber, findComponentBoundary } from './fiber';
import type { Patch } from '../../shared/types';
import { css, TEAL, TEAL_06, Z_LOCKED, FIXED_OVERLAY, CURSOR_LABEL, INDICATOR_BASE, DASHED_BORDER, ARROW_BASE, LINE_BASE } from './styles';

type DropPosition = 'before' | 'after' | 'first-child' | 'last-child';

// Callback for generic insertion (used by canvas insertion)
type InsertCallback = (target: HTMLElement, position: DropPosition) => void;

// Callback for element-select arming (used by replace mode)
type ElementSelectCallback = (target: HTMLElement) => void;

// ── State ────────────────────────────────────────────────────────────────

let active = false;
let componentName = '';
let storyId = '';
let ghostHtml = '';
let componentPath = '';
let componentArgs: Record<string, unknown> = {};

let cursorLabelEl: HTMLElement | null = null;
let indicatorEl: HTMLElement | null = null;
let arrowLeftEl: HTMLElement | null = null;
let arrowRightEl: HTMLElement | null = null;
let currentTarget: HTMLElement | null = null;
let currentPosition: DropPosition | null = null;
let overlayHost: HTMLElement | null = null;

// When set, onClick calls this instead of the component-drop flow
let insertCallback: InsertCallback | null = null;

// Element-select mode — shows hover outline, click picks an element (no position)
let elementSelectMode = false;
let elementSelectCallback: ElementSelectCallback | null = null;
let elementSelectOutlineEl: HTMLElement | null = null;

// Browse mode — shows indicators, click locks a position
let browseMode = false;
let browseOnLocked: ((target: HTMLElement, position: DropPosition) => void) | null = null;
let lockedTarget: HTMLElement | null = null;
let lockedPosition: DropPosition | null = null;
let lockedIndicatorEl: HTMLElement | null = null;
let lockedArrowLeft: HTMLElement | null = null;
let lockedArrowRight: HTMLElement | null = null;

// ── Public API ───────────────────────────────────────────────────────────

export function armInsert(
  msg: { componentName: string; storyId: string; ghostHtml: string; componentPath?: string; args?: Record<string, unknown> },
  shadowHost: HTMLElement,
): void {
  if (active) cleanup();
  active = true;
  componentName = msg.componentName;
  storyId = msg.storyId;
  ghostHtml = msg.ghostHtml;
  componentPath = msg.componentPath ?? '';
  componentArgs = msg.args ?? {};
  overlayHost = shadowHost;

  // Crosshair cursor on the entire page
  document.documentElement.style.cursor = 'crosshair';

  // Floating cursor label — teal pill that follows the cursor
  cursorLabelEl = document.createElement('div');
  cursorLabelEl.style.cssText = css(CURSOR_LABEL);
  cursorLabelEl.textContent = `Place: ${componentName}`;
  document.body.appendChild(cursorLabelEl);

  // Drop indicator (reused and repositioned on each move)
  indicatorEl = document.createElement('div');
  indicatorEl.style.cssText = css(INDICATOR_BASE);
  document.body.appendChild(indicatorEl);

  document.addEventListener('mousemove', onMouseMove);
  document.documentElement.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('click', onClick, true); // capture so we can prevent default
  document.addEventListener('keydown', onKeyDown);
}

export function cancelInsert(): void {
  cleanup();
}

/**
 * Directly replace a target element with a component — no hover/click needed.
 * Used by replace mode after element-select picks the target.
 */
export function replaceElement(
  target: HTMLElement,
  msg: { componentName: string; storyId: string; ghostHtml: string; componentPath?: string; args?: Record<string, unknown> },
): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = msg.ghostHtml.trim();
  const inserted = template.content.firstElementChild as HTMLElement | null;
  if (!inserted) return null;
  inserted.dataset.twDroppedComponent = msg.componentName;

  // Replace: insert the ghost before the target, then hide the target
  target.insertAdjacentElement('beforebegin', inserted);
  target.style.display = 'none';

  const targetSelector = buildSelector(target);

  const isGhostTarget = !!target.dataset.twDroppedComponent;
  const ghostTargetPatchId = target.dataset.twDroppedPatchId;
  const ghostTargetName = target.dataset.twDroppedComponent;
  const ghostAncestor = !isGhostTarget ? findGhostAncestor(target) : null;
  const effectiveGhostName = isGhostTarget ? ghostTargetName : ghostAncestor?.dataset.twDroppedComponent;
  const effectiveGhostPatchId = isGhostTarget ? ghostTargetPatchId : ghostAncestor?.dataset.twDroppedPatchId;

  const context = effectiveGhostName
    ? `Replace the <${effectiveGhostName} /> component (pending insertion from an earlier drop) with "${msg.componentName}"`
    : buildContext(target, '', '', new Map());

  let parentComponent: { name: string } | undefined;
  const fiber = getFiber(target);
  if (fiber) {
    const boundary = findComponentBoundary(fiber);
    if (boundary) parentComponent = { name: boundary.componentName };
  }

  const patch: Patch = {
    id: crypto.randomUUID(),
    kind: 'component-drop',
    elementKey: targetSelector,
    status: 'staged',
    originalClass: '',
    newClass: '',
    property: 'component-drop',
    timestamp: new Date().toISOString(),
    component: { name: msg.componentName },
    target: isGhostTarget
      ? { tag: ghostTargetName?.toLowerCase() ?? 'unknown', classes: '', innerText: '' }
      : {
          tag: target.tagName.toLowerCase(),
          classes: target.className,
          innerText: target.innerText.slice(0, 100),
        },
    ghostHtml: msg.ghostHtml,
    componentStoryId: msg.storyId,
    componentPath: msg.componentPath || undefined,
    componentArgs: Object.keys(msg.args ?? {}).length > 0 ? msg.args : undefined,
    parentComponent,
    insertMode: 'replace',
    context,
    ...(effectiveGhostPatchId ? { targetPatchId: effectiveGhostPatchId, targetComponentName: effectiveGhostName } : {}),
  };

  inserted.dataset.twDroppedPatchId = patch.id;

  send({ type: 'COMPONENT_DROPPED', patch });
  sendTo('panel', { type: 'COMPONENT_DISARMED' });

  return inserted;
}

/**
 * Arm a generic insertion — shows drop-zone indicators, and on click calls the
 * provided callback with the target element and position. Used for canvas insertion.
 */
export function armGenericInsert(
  label: string,
  shadowHost: HTMLElement,
  callback: InsertCallback,
): void {
  if (active) cleanup();
  active = true;
  insertCallback = callback;
  overlayHost = shadowHost;

  document.documentElement.style.cursor = 'crosshair';

  cursorLabelEl = document.createElement('div');
  cursorLabelEl.style.cssText = css(CURSOR_LABEL);
  cursorLabelEl.textContent = label;
  document.body.appendChild(cursorLabelEl);

  indicatorEl = document.createElement('div');
  indicatorEl.style.cssText = css(INDICATOR_BASE);
  document.body.appendChild(indicatorEl);

  document.addEventListener('mousemove', onMouseMove);
  document.documentElement.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Arm element-select mode — shows a hover outline around elements.
 * On click, calls the provided callback with the target element (no position).
 * Used for replace-mode canvas/component placement where we need to pick an
 * element rather than a drop position.
 */
export function armElementSelect(
  label: string,
  shadowHost: HTMLElement,
  callback: ElementSelectCallback,
): void {
  if (active) cleanup();
  active = true;
  elementSelectMode = true;
  elementSelectCallback = callback;
  overlayHost = shadowHost;

  document.documentElement.style.cursor = 'crosshair';

  cursorLabelEl = document.createElement('div');
  cursorLabelEl.style.cssText = css(CURSOR_LABEL);
  cursorLabelEl.textContent = label;
  document.body.appendChild(cursorLabelEl);

  // Outline element (teal dashed border) instead of drop-position indicator
  elementSelectOutlineEl = document.createElement('div');
  elementSelectOutlineEl.style.cssText = css({ ...INDICATOR_BASE, ...DASHED_BORDER });
  document.body.appendChild(elementSelectOutlineEl);

  document.addEventListener('mousemove', onMouseMoveElementSelect);
  document.documentElement.addEventListener('mouseleave', onMouseLeaveElementSelect);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}

export function isActive(): boolean {
  return active;
}

/**
 * Start browse mode — shows drop-zone indicators as the user hovers.
 * Clicking locks a target+position (persistent indicator). The locked position
 * can be retrieved with getLockedInsert() for later use (e.g. canvas placement).
 */
export function startBrowse(
  shadowHost: HTMLElement,
  onLocked?: (target: HTMLElement, position: DropPosition) => void,
): void {
  if (active) cleanup();
  clearLockedInsert();
  active = true;
  browseMode = true;
  browseOnLocked = onLocked ?? null;
  overlayHost = shadowHost;

  document.documentElement.style.cursor = 'crosshair';

  cursorLabelEl = document.createElement('div');
  cursorLabelEl.style.cssText = css(CURSOR_LABEL);
  cursorLabelEl.textContent = 'Pick insertion point';
  document.body.appendChild(cursorLabelEl);

  indicatorEl = document.createElement('div');
  indicatorEl.style.cssText = css(INDICATOR_BASE);
  document.body.appendChild(indicatorEl);

  document.addEventListener('mousemove', onMouseMove);
  document.documentElement.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Get the locked insertion point (target + position) from browse mode.
 */
export function getLockedInsert(): { target: HTMLElement; position: DropPosition } | null {
  if (!lockedTarget || !lockedPosition) return null;
  return { target: lockedTarget, position: lockedPosition };
}

/**
 * Clear the locked insertion point and remove its indicator.
 */
export function clearLockedInsert(): void {
  lockedTarget = null;
  lockedPosition = null;
  if (lockedIndicatorEl) { lockedIndicatorEl.remove(); lockedIndicatorEl = null; }
  if (lockedArrowLeft) { lockedArrowLeft.remove(); lockedArrowLeft = null; }
  if (lockedArrowRight) { lockedArrowRight.remove(); lockedArrowRight = null; }
}

// ── Drop position computation (matches Phase 1 useDropZone logic) ────────

function getAxis(el: Element): 'vertical' | 'horizontal' {
  const style = getComputedStyle(el);
  if (style.display.includes('flex')) {
    return style.flexDirection.startsWith('row') ? 'horizontal' : 'vertical';
  }
  if (style.display.includes('grid')) {
    return style.gridAutoFlow.startsWith('column') ? 'horizontal' : 'vertical';
  }
  return 'vertical';
}

function computeDropPosition(
  cursor: { x: number; y: number },
  rect: DOMRect,
  axis: 'vertical' | 'horizontal',
): DropPosition {
  const ratio =
    axis === 'horizontal'
      ? (cursor.x - rect.left) / rect.width
      : (cursor.y - rect.top) / rect.height;
  if (ratio < 0.25) return 'before';
  if (ratio < 0.5) return 'first-child';
  if (ratio < 0.75) return 'last-child';
  return 'after';
}

// ── Hit-test: find the deepest element under cursor ──────────────────────

function findTarget(x: number, y: number): HTMLElement | null {
  if (indicatorEl) indicatorEl.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  if (indicatorEl) indicatorEl.style.display = '';
  if (!el || el === document.documentElement || el === document.body) return null;
  // Skip overlay elements
  if (overlayHost && (el === overlayHost || overlayHost.contains(el))) return null;
  // Skip our own indicator
  if (indicatorEl && (el === indicatorEl || indicatorEl.contains(el))) return null;
  return el as HTMLElement;
}

// ── Pulse animation (injected once into document.head) ───────────────────

function ensurePulseStyle(): void {
  if (document.getElementById('tw-drop-pulse-style')) return;
  const style = document.createElement('style');
  style.id = 'tw-drop-pulse-style';
  style.textContent = `
    @keyframes tw-drop-pulse {
      0%, 100% { filter: hue-rotate(0deg); }
      50%      { filter: hue-rotate(189deg); }
    }
  `;
  document.head.appendChild(style);
}

// ── Shared indicator rendering ───────────────────────────────────────────

interface RenderIndicatorOpts {
  zIndex: number;
  bgTint?: string;
  animate?: boolean;
}

function renderIndicator(
  container: HTMLElement,
  position: DropPosition,
  axis: 'vertical' | 'horizontal',
  rect: DOMRect,
  opts: RenderIndicatorOpts,
): { arrowLeft: HTMLElement | null; arrowRight: HTMLElement | null } {
  const isInside = position === 'first-child' || position === 'last-child';

  if (isInside) {
    container.style.cssText = css({
      ...FIXED_OVERLAY,
      ...DASHED_BORDER,
      zIndex: `${opts.zIndex}`,
      display: 'block',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      background: opts.bgTint ?? 'none',
      ...(opts.animate ? { animation: 'tw-drop-pulse 2s ease-in-out infinite' } : {}),
    });

    const arrow = document.createElement('div');
    arrow.style.cssText = css(ARROW_BASE);

    const size = 6;
    const isVertical = axis === 'vertical';

    if (position === 'first-child') {
      if (isVertical) {
        arrow.style.top = '4px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%)';
        arrow.style.borderWidth = `${size}px ${size}px 0 ${size}px`;
        arrow.style.borderColor = `${TEAL} transparent transparent transparent`;
      } else {
        arrow.style.left = '4px';
        arrow.style.top = '50%';
        arrow.style.transform = 'translateY(-50%)';
        arrow.style.borderWidth = `${size}px 0 ${size}px ${size}px`;
        arrow.style.borderColor = `transparent transparent transparent ${TEAL}`;
      }
    } else {
      if (isVertical) {
        arrow.style.bottom = '4px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%)';
        arrow.style.borderWidth = `0 ${size}px ${size}px ${size}px`;
        arrow.style.borderColor = `transparent transparent ${TEAL} transparent`;
      } else {
        arrow.style.right = '4px';
        arrow.style.top = '50%';
        arrow.style.transform = 'translateY(-50%)';
        arrow.style.borderWidth = `${size}px ${size}px ${size}px 0`;
        arrow.style.borderColor = `transparent ${TEAL} transparent transparent`;
      }
    }
    container.appendChild(arrow);
    return { arrowLeft: arrow, arrowRight: null };
  }

  // Line mode (before/after)
  const lineWidth = 3;
  const isHorizontalLine = axis === 'vertical';

  if (isHorizontalLine) {
    const y = position === 'before' ? rect.top : rect.bottom;
    container.style.cssText = css({
      ...LINE_BASE,
      zIndex: `${opts.zIndex}`,
      top: `${y - lineWidth / 2}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${lineWidth}px`,
      borderRadius: `${lineWidth}px`,
      ...(opts.animate ? { animation: 'tw-drop-pulse 2s ease-in-out infinite' } : {}),
    });
  } else {
    const x = position === 'before' ? rect.left : rect.right;
    container.style.cssText = css({
      ...LINE_BASE,
      zIndex: `${opts.zIndex}`,
      top: `${rect.top}px`,
      left: `${x - lineWidth / 2}px`,
      width: `${lineWidth}px`,
      height: `${rect.height}px`,
      borderRadius: `${lineWidth}px`,
      ...(opts.animate ? { animation: 'tw-drop-pulse 2s ease-in-out infinite' } : {}),
    });
  }

  // Inward-pointing arrow end-caps (>———<)
  const arrowSize = 5;
  const inset = -2;

  const arrowLeft = document.createElement('div');
  arrowLeft.style.cssText = css(ARROW_BASE);
  const arrowRight = document.createElement('div');
  arrowRight.style.cssText = css(ARROW_BASE);

  if (isHorizontalLine) {
    arrowLeft.style.top = '50%';
    arrowLeft.style.left = `${inset}px`;
    arrowLeft.style.transform = 'translateY(-50%)';
    arrowLeft.style.borderWidth = `${arrowSize}px 0 ${arrowSize}px ${arrowSize}px`;
    arrowLeft.style.borderColor = `transparent transparent transparent ${TEAL}`;
    arrowRight.style.top = '50%';
    arrowRight.style.right = `${inset}px`;
    arrowRight.style.transform = 'translateY(-50%)';
    arrowRight.style.borderWidth = `${arrowSize}px ${arrowSize}px ${arrowSize}px 0`;
    arrowRight.style.borderColor = `transparent ${TEAL} transparent transparent`;
  } else {
    arrowLeft.style.left = '50%';
    arrowLeft.style.top = `${inset}px`;
    arrowLeft.style.transform = 'translateX(-50%)';
    arrowLeft.style.borderWidth = `${arrowSize}px ${arrowSize}px 0 ${arrowSize}px`;
    arrowLeft.style.borderColor = `${TEAL} transparent transparent transparent`;
    arrowRight.style.left = '50%';
    arrowRight.style.bottom = `${inset}px`;
    arrowRight.style.transform = 'translateX(-50%)';
    arrowRight.style.borderWidth = `0 ${arrowSize}px ${arrowSize}px ${arrowSize}px`;
    arrowRight.style.borderColor = `transparent transparent ${TEAL} transparent`;
  }

  container.appendChild(arrowLeft);
  container.appendChild(arrowRight);
  return { arrowLeft, arrowRight };
}

// ── Indicator rendering (hover — no animation) ──────────────────────────

function showIndicator(target: HTMLElement, position: DropPosition, axis: 'vertical' | 'horizontal'): void {
  if (!indicatorEl) return;

  if (arrowLeftEl) { arrowLeftEl.remove(); arrowLeftEl = null; }
  if (arrowRightEl) { arrowRightEl.remove(); arrowRightEl = null; }

  const rect = target.getBoundingClientRect();
  const arrows = renderIndicator(indicatorEl, position, axis, rect, { zIndex: 2147483645 });
  arrowLeftEl = arrows.arrowLeft;
  arrowRightEl = arrows.arrowRight;
}

function hideIndicator(): void {
  if (indicatorEl) indicatorEl.style.display = 'none';
  if (arrowLeftEl) { arrowLeftEl.remove(); arrowLeftEl = null; }
  if (arrowRightEl) { arrowRightEl.remove(); arrowRightEl = null; }
  currentTarget = null;
  currentPosition = null;
}

// ── Event handlers ───────────────────────────────────────────────────────

function onMouseMove(e: MouseEvent): void {
  if (!active) return;

  // Move cursor label near the pointer
  if (cursorLabelEl) {
    cursorLabelEl.style.left = `${e.clientX + 14}px`;
    cursorLabelEl.style.top = `${e.clientY - 28}px`;
    cursorLabelEl.style.opacity = '1';
  }

  const target = findTarget(e.clientX, e.clientY);

  if (!target) {
    hideIndicator();
    return;
  }

  const parentAxis = target.parentElement ? getAxis(target.parentElement) : 'vertical';
  const rect = target.getBoundingClientRect();
  const position = computeDropPosition(
    { x: e.clientX, y: e.clientY },
    rect,
    parentAxis,
  );

  currentTarget = target;
  currentPosition = position;
  showIndicator(target, position, parentAxis);
}

function onMouseLeave(): void {
  hideIndicator();
  if (cursorLabelEl) cursorLabelEl.style.opacity = '0';
}

// ── Element-select mouse handlers ────────────────────────────────────────

function onMouseMoveElementSelect(e: MouseEvent): void {
  if (!active || !elementSelectMode) return;

  if (cursorLabelEl) {
    cursorLabelEl.style.left = `${e.clientX + 14}px`;
    cursorLabelEl.style.top = `${e.clientY - 28}px`;
    cursorLabelEl.style.opacity = '1';
  }

  const target = findTarget(e.clientX, e.clientY);
  if (!target) {
    hideElementSelectOutline();
    currentTarget = null;
    return;
  }

  currentTarget = target;
  showElementSelectOutline(target);
}

function onMouseLeaveElementSelect(): void {
  hideElementSelectOutline();
  currentTarget = null;
  if (cursorLabelEl) cursorLabelEl.style.opacity = '0';
}

function showElementSelectOutline(target: HTMLElement): void {
  if (!elementSelectOutlineEl) return;
  const rect = target.getBoundingClientRect();
  elementSelectOutlineEl.style.top = `${rect.top}px`;
  elementSelectOutlineEl.style.left = `${rect.left}px`;
  elementSelectOutlineEl.style.width = `${rect.width}px`;
  elementSelectOutlineEl.style.height = `${rect.height}px`;
  elementSelectOutlineEl.style.display = 'block';
}

function hideElementSelectOutline(): void {
  if (elementSelectOutlineEl) elementSelectOutlineEl.style.display = 'none';
}

function onClick(e: MouseEvent): void {
  if (!active) return;

  // Element-select mode — pick the element, no position needed
  if (elementSelectMode) {
    if (!currentTarget) return; // clicked empty area, keep waiting
    e.preventDefault();
    e.stopPropagation();
    const target = currentTarget;
    const cb = elementSelectCallback;
    cleanup();
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    if (cb) cb(target);
    return;
  }

  if (!currentTarget || !currentPosition) {
    if (browseMode) {
      // Clicked in empty area during browse — just ignore, keep browsing
      return;
    }
    cleanup();
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  // Browse mode — lock the position and keep a persistent indicator
  if (browseMode) {
    clearLockedInsert();
    lockedTarget = currentTarget;
    lockedPosition = currentPosition;

    // Create a persistent indicator at the locked position
    const parentAxis = currentTarget.parentElement ? getAxis(currentTarget.parentElement) : 'vertical';
    lockedIndicatorEl = document.createElement('div');
    lockedIndicatorEl.style.cssText = css({ ...FIXED_OVERLAY, zIndex: Z_LOCKED });
    document.body.appendChild(lockedIndicatorEl);
    showLockedIndicator(currentTarget, currentPosition, parentAxis);

    // Resolve target component name for the panel label
    const fiber = getFiber(currentTarget);
    const boundary = fiber ? findComponentBoundary(fiber) : null;
    const targetName = boundary?.componentName ?? currentTarget.tagName.toLowerCase();

    // Notify panel of the locked insertion point
    sendTo('panel', {
      type: 'INSERT_POINT_LOCKED',
      position: currentPosition,
      targetName,
      targetTag: currentTarget.tagName.toLowerCase(),
    });

    // End browse mode (stop tracking mouse) but keep the locked indicator
    const lockedEl = currentTarget;
    const lockedPos = currentPosition;
    const cb = browseOnLocked;
    cleanup();

    // Notify callback so the overlay can show toolbar at the locked target
    if (cb) cb(lockedEl, lockedPos);
    return;
  }

  // Generic insertion mode (e.g. canvas) — delegate to callback
  if (insertCallback) {
    const target = currentTarget;
    const position = currentPosition;
    const cb = insertCallback;
    cleanup();
    cb(target, position);
    return;
  }

  // Insert the component HTML directly (no wrapper div — preserves inline flow)
  const template = document.createElement('template');
  template.innerHTML = ghostHtml.trim();
  const inserted = template.content.firstElementChild as HTMLElement | null;
  if (!inserted) {
    cleanup();
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    return;
  }
  inserted.dataset.twDroppedComponent = componentName;

  switch (currentPosition) {
    case 'before':
      currentTarget.insertAdjacentElement('beforebegin', inserted);
      break;
    case 'after':
      currentTarget.insertAdjacentElement('afterend', inserted);
      break;
    case 'first-child':
      currentTarget.insertAdjacentElement('afterbegin', inserted);
      break;
    case 'last-child':
      currentTarget.appendChild(inserted);
      break;
  }

  // Build a CSS selector for the target element
  const targetSelector = buildSelector(currentTarget);

  // Detect if the drop target is a ghost from an earlier component-drop
  const isGhostTarget = !!currentTarget.dataset.twDroppedComponent;
  const ghostTargetPatchId = currentTarget.dataset.twDroppedPatchId;
  const ghostTargetName = currentTarget.dataset.twDroppedComponent;

  // Also detect when the drop target is a child element INSIDE a ghost
  const ghostAncestor = !isGhostTarget ? findGhostAncestor(currentTarget) : null;
  const effectiveGhostName = isGhostTarget ? ghostTargetName : ghostAncestor?.dataset.twDroppedComponent;
  const effectiveGhostPatchId = isGhostTarget ? ghostTargetPatchId : ghostAncestor?.dataset.twDroppedPatchId;

  // Build rich context HTML (same as class-change and design patches)
  const context = effectiveGhostName
    ? `Place "${componentName}" ${currentPosition} the <${effectiveGhostName} /> component (pending insertion from an earlier drop)`
    : buildContext(currentTarget, '', '', new Map());

  // Resolve the parent React component via fiber walking
  let parentComponent: { name: string } | undefined;
  const fiber = getFiber(currentTarget);
  if (fiber) {
    const boundary = findComponentBoundary(fiber);
    if (boundary) {
      parentComponent = { name: boundary.componentName };
    }
  }

  // Stage a component-drop patch
  const patch: Patch = {
    id: crypto.randomUUID(),
    kind: 'component-drop',
    elementKey: targetSelector,
    status: 'staged',
    originalClass: '',
    newClass: '',
    property: 'component-drop',
    timestamp: new Date().toISOString(),
    component: { name: componentName },
    target: isGhostTarget
      ? { tag: ghostTargetName?.toLowerCase() ?? 'unknown', classes: '', innerText: '' }
      : {
          tag: currentTarget.tagName.toLowerCase(),
          classes: currentTarget.className,
          innerText: currentTarget.innerText.slice(0, 100),
        },
    ghostHtml,
    componentStoryId: storyId,
    componentPath: componentPath || undefined,
    componentArgs: Object.keys(componentArgs).length > 0 ? componentArgs : undefined,
    parentComponent,
    insertMode: currentPosition,
    context,
    ...(effectiveGhostPatchId ? { targetPatchId: effectiveGhostPatchId, targetComponentName: effectiveGhostName } : {}),
  };

  // Stamp the ghost with the patch ID so subsequent drops can reference it
  inserted.dataset.twDroppedPatchId = patch.id;

  send({ type: 'COMPONENT_DROPPED', patch });
  sendTo('panel', { type: 'COMPONENT_DISARMED' });

  cleanup();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    cleanup();
  }
}

// ── Locked indicator (persistent, pulsing, used by browse mode) ──────────

function showLockedIndicator(target: HTMLElement, position: DropPosition, axis: 'vertical' | 'horizontal'): void {
  if (!lockedIndicatorEl) return;
  ensurePulseStyle();

  if (lockedArrowLeft) { lockedArrowLeft.remove(); lockedArrowLeft = null; }
  if (lockedArrowRight) { lockedArrowRight.remove(); lockedArrowRight = null; }

  const rect = target.getBoundingClientRect();
  const arrows = renderIndicator(lockedIndicatorEl, position, axis, rect, {
    zIndex: 2147483644,
    bgTint: TEAL_06,
    animate: true,
  });
  lockedArrowLeft = arrows.arrowLeft;
  lockedArrowRight = arrows.arrowRight;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function findGhostAncestor(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el.parentElement;
  while (current && current !== document.body) {
    if (current.dataset.twDroppedComponent) return current;
    current = current.parentElement;
  }
  return null;
}

function buildSelector(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `#${el.id}`;
  const classes = Array.from(el.classList).slice(0, 3).join('.');
  return classes ? `${tag}.${classes}` : tag;
}

function cleanup(): void {
  const wasElementSelect = elementSelectMode;
  active = false;
  browseMode = false;
  browseOnLocked = null;
  insertCallback = null;
  elementSelectMode = false;
  elementSelectCallback = null;
  document.documentElement.style.cursor = '';

  if (wasElementSelect) {
    document.removeEventListener('mousemove', onMouseMoveElementSelect);
    document.documentElement.removeEventListener('mouseleave', onMouseLeaveElementSelect);
  } else {
    document.removeEventListener('mousemove', onMouseMove);
    document.documentElement.removeEventListener('mouseleave', onMouseLeave);
  }
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown);

  if (cursorLabelEl) { cursorLabelEl.remove(); cursorLabelEl = null; }
  if (indicatorEl) { indicatorEl.remove(); indicatorEl = null; }
  if (elementSelectOutlineEl) { elementSelectOutlineEl.remove(); elementSelectOutlineEl = null; }
  arrowLeftEl = null;
  arrowRightEl = null;
  currentTarget = null;
  currentPosition = null;
}
