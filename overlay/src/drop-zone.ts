// Drop-zone tracking system for component arm-and-place.
// Runs in the overlay (vanilla DOM — no React).
//
// State is modelled as a discriminated union (DropZoneMode) instead of
// independent boolean flags, making invalid state combinations impossible.

import { send, sendTo } from './ws';
import { buildContext } from './context';
import { getFiber, findComponentBoundary } from './fiber';
import type { Patch } from '../../shared/types';
import { css, TEAL, TEAL_06, Z_LOCKED, FIXED_OVERLAY, CURSOR_LABEL, INDICATOR_BASE, DASHED_BORDER, ARROW_BASE, LINE_BASE } from './styles';

type DropPosition = 'before' | 'after' | 'first-child' | 'last-child';

type InsertCallback = (target: HTMLElement, position: DropPosition) => void;
type ElementSelectCallback = (target: HTMLElement) => void;

// ── Discriminated union state ────────────────────────────────────────────

type DropZoneMode =
  | { kind: 'idle' }
  | {
      kind: 'component-insert';
      componentName: string;
      storyId: string;
      ghostHtml: string;
      componentPath: string;
      componentArgs: Record<string, unknown>;
    }
  | { kind: 'generic-insert'; callback: InsertCallback }
  | { kind: 'element-select'; callback: ElementSelectCallback }
  | { kind: 'browse'; onLocked: ((target: HTMLElement, position: DropPosition) => void) | null };

let mode: DropZoneMode = { kind: 'idle' };

// ── Tracked DOM elements ─────────────────────────────────────────────────

interface DropZoneDOM {
  overlayHost: HTMLElement | null;
  cursorLabel: HTMLElement | null;
  indicator: HTMLElement | null;
  arrowLeft: HTMLElement | null;
  arrowRight: HTMLElement | null;
  outlineEl: HTMLElement | null;
  currentTarget: HTMLElement | null;
  currentPosition: DropPosition | null;
}

const dom: DropZoneDOM = {
  overlayHost: null,
  cursorLabel: null,
  indicator: null,
  arrowLeft: null,
  arrowRight: null,
  outlineEl: null,
  currentTarget: null,
  currentPosition: null,
};

interface LockedState {
  target: HTMLElement | null;
  position: DropPosition | null;
  indicator: HTMLElement | null;
  arrowLeft: HTMLElement | null;
  arrowRight: HTMLElement | null;
}

const locked: LockedState = {
  target: null,
  position: null,
  indicator: null,
  arrowLeft: null,
  arrowRight: null,
};

// ── Public API (signatures unchanged) ────────────────────────────────────

export function armInsert(
  msg: { componentName: string; storyId: string; ghostHtml: string; componentPath?: string; args?: Record<string, unknown> },
  shadowHost: HTMLElement,
): void {
  arm(
    {
      kind: 'component-insert',
      componentName: msg.componentName,
      storyId: msg.storyId,
      ghostHtml: msg.ghostHtml,
      componentPath: msg.componentPath ?? '',
      componentArgs: msg.args ?? {},
    },
    shadowHost,
    `Place: ${msg.componentName}`,
  );
}

export function cancelInsert(): void {
  cleanup();
}

export function replaceElement(
  target: HTMLElement,
  msg: { componentName: string; storyId: string; ghostHtml: string; componentPath?: string; args?: Record<string, unknown> },
): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = msg.ghostHtml.trim();
  const inserted = template.content.firstElementChild as HTMLElement | null;
  if (!inserted) return null;
  inserted.dataset.twDroppedComponent = msg.componentName;

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

export function armGenericInsert(
  label: string,
  shadowHost: HTMLElement,
  callback: InsertCallback,
): void {
  arm({ kind: 'generic-insert', callback }, shadowHost, label);
}

export function armElementSelect(
  label: string,
  shadowHost: HTMLElement,
  callback: ElementSelectCallback,
): void {
  arm({ kind: 'element-select', callback }, shadowHost, label);
}

export function isActive(): boolean {
  return mode.kind !== 'idle';
}

export function startBrowse(
  shadowHost: HTMLElement,
  onLocked?: (target: HTMLElement, position: DropPosition) => void,
): void {
  clearLockedInsert();
  arm({ kind: 'browse', onLocked: onLocked ?? null }, shadowHost, 'Pick insertion point');
}

export function getLockedInsert(): { target: HTMLElement; position: DropPosition } | null {
  if (!locked.target || !locked.position) return null;
  return { target: locked.target, position: locked.position };
}

export function clearLockedInsert(): void {
  locked.target = null;
  locked.position = null;
  if (locked.indicator) { locked.indicator.remove(); locked.indicator = null; }
  if (locked.arrowLeft) { locked.arrowLeft.remove(); locked.arrowLeft = null; }
  if (locked.arrowRight) { locked.arrowRight.remove(); locked.arrowRight = null; }
}

// ── Shared arming logic ──────────────────────────────────────────────────

function arm(newMode: DropZoneMode, shadowHost: HTMLElement, label: string): void {
  if (mode.kind !== 'idle') cleanup();
  mode = newMode;
  dom.overlayHost = shadowHost;

  document.documentElement.style.cursor = 'crosshair';

  dom.cursorLabel = document.createElement('div');
  dom.cursorLabel.style.cssText = css(CURSOR_LABEL);
  dom.cursorLabel.textContent = label;
  document.body.appendChild(dom.cursorLabel);

  if (newMode.kind === 'element-select') {
    dom.outlineEl = document.createElement('div');
    dom.outlineEl.style.cssText = css({ ...INDICATOR_BASE, ...DASHED_BORDER });
    document.body.appendChild(dom.outlineEl);
  } else {
    dom.indicator = document.createElement('div');
    dom.indicator.style.cssText = css(INDICATOR_BASE);
    document.body.appendChild(dom.indicator);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.documentElement.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}

// ── Drop position computation ────────────────────────────────────────────

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

// ── Hit-test ─────────────────────────────────────────────────────────────

function findTarget(x: number, y: number): HTMLElement | null {
  if (dom.indicator) dom.indicator.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  if (dom.indicator) dom.indicator.style.display = '';
  if (!el || el === document.documentElement || el === document.body) return null;
  if (dom.overlayHost && (el === dom.overlayHost || dom.overlayHost.contains(el))) return null;
  if (dom.indicator && (el === dom.indicator || dom.indicator.contains(el))) return null;
  return el as HTMLElement;
}

// ── Pulse animation ──────────────────────────────────────────────────────

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

// ── Hover indicator helpers ──────────────────────────────────────────────

function showDropIndicator(target: HTMLElement, position: DropPosition, axis: 'vertical' | 'horizontal'): void {
  if (!dom.indicator) return;

  if (dom.arrowLeft) { dom.arrowLeft.remove(); dom.arrowLeft = null; }
  if (dom.arrowRight) { dom.arrowRight.remove(); dom.arrowRight = null; }

  const rect = target.getBoundingClientRect();
  const arrows = renderIndicator(dom.indicator, position, axis, rect, { zIndex: 2147483645 });
  dom.arrowLeft = arrows.arrowLeft;
  dom.arrowRight = arrows.arrowRight;
}

function hideDropIndicator(): void {
  if (dom.indicator) dom.indicator.style.display = 'none';
  if (dom.arrowLeft) { dom.arrowLeft.remove(); dom.arrowLeft = null; }
  if (dom.arrowRight) { dom.arrowRight.remove(); dom.arrowRight = null; }
  dom.currentTarget = null;
  dom.currentPosition = null;
}

function showElementSelectOutline(target: HTMLElement): void {
  if (!dom.outlineEl) return;
  const rect = target.getBoundingClientRect();
  dom.outlineEl.style.top = `${rect.top}px`;
  dom.outlineEl.style.left = `${rect.left}px`;
  dom.outlineEl.style.width = `${rect.width}px`;
  dom.outlineEl.style.height = `${rect.height}px`;
  dom.outlineEl.style.display = 'block';
}

function hideElementSelectOutline(): void {
  if (dom.outlineEl) dom.outlineEl.style.display = 'none';
}

function showLockedIndicator(target: HTMLElement, position: DropPosition, axis: 'vertical' | 'horizontal'): void {
  if (!locked.indicator) return;
  ensurePulseStyle();

  if (locked.arrowLeft) { locked.arrowLeft.remove(); locked.arrowLeft = null; }
  if (locked.arrowRight) { locked.arrowRight.remove(); locked.arrowRight = null; }

  const rect = target.getBoundingClientRect();
  const arrows = renderIndicator(locked.indicator, position, axis, rect, {
    zIndex: 2147483644,
    bgTint: TEAL_06,
    animate: true,
  });
  locked.arrowLeft = arrows.arrowLeft;
  locked.arrowRight = arrows.arrowRight;
}

// ── Unified event handlers ───────────────────────────────────────────────

function updateCursorLabel(e: MouseEvent): void {
  if (dom.cursorLabel) {
    dom.cursorLabel.style.left = `${e.clientX + 14}px`;
    dom.cursorLabel.style.top = `${e.clientY - 28}px`;
    dom.cursorLabel.style.opacity = '1';
  }
}

function onMouseMove(e: MouseEvent): void {
  if (mode.kind === 'idle') return;

  updateCursorLabel(e);
  const target = findTarget(e.clientX, e.clientY);

  if (mode.kind === 'element-select') {
    if (!target) {
      hideElementSelectOutline();
      dom.currentTarget = null;
      return;
    }
    dom.currentTarget = target;
    showElementSelectOutline(target);
    return;
  }

  // component-insert, generic-insert, browse
  if (!target) {
    hideDropIndicator();
    return;
  }

  const parentAxis = target.parentElement ? getAxis(target.parentElement) : 'vertical';
  const rect = target.getBoundingClientRect();
  const position = computeDropPosition({ x: e.clientX, y: e.clientY }, rect, parentAxis);

  dom.currentTarget = target;
  dom.currentPosition = position;
  showDropIndicator(target, position, parentAxis);
}

function onMouseLeave(): void {
  if (mode.kind === 'element-select') {
    hideElementSelectOutline();
    dom.currentTarget = null;
  } else {
    hideDropIndicator();
  }
  if (dom.cursorLabel) dom.cursorLabel.style.opacity = '0';
}

function onClick(e: MouseEvent): void {
  if (mode.kind === 'idle') return;

  switch (mode.kind) {
    case 'element-select': return handleElementSelectClick(e);
    case 'browse': return handleBrowseClick(e);
    case 'generic-insert': return handleGenericInsertClick(e);
    case 'component-insert': return handleComponentInsertClick(e);
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    cleanup();
  }
}

// ── Per-mode click handlers ──────────────────────────────────────────────

function handleElementSelectClick(e: MouseEvent): void {
  if (!dom.currentTarget) return;
  e.preventDefault();
  e.stopPropagation();
  const target = dom.currentTarget;
  const cb = mode.kind === 'element-select' ? mode.callback : null;
  cleanup();
  sendTo('panel', { type: 'COMPONENT_DISARMED' });
  if (cb) cb(target);
}

function handleBrowseClick(e: MouseEvent): void {
  if (!dom.currentTarget || !dom.currentPosition) return;
  e.preventDefault();
  e.stopPropagation();

  clearLockedInsert();
  locked.target = dom.currentTarget;
  locked.position = dom.currentPosition;

  const parentAxis = dom.currentTarget.parentElement ? getAxis(dom.currentTarget.parentElement) : 'vertical';
  locked.indicator = document.createElement('div');
  locked.indicator.style.cssText = css({ ...FIXED_OVERLAY, zIndex: Z_LOCKED });
  document.body.appendChild(locked.indicator);
  showLockedIndicator(dom.currentTarget, dom.currentPosition, parentAxis);

  const fiber = getFiber(dom.currentTarget);
  const boundary = fiber ? findComponentBoundary(fiber) : null;
  const targetName = boundary?.componentName ?? dom.currentTarget.tagName.toLowerCase();

  sendTo('panel', {
    type: 'INSERT_POINT_LOCKED',
    position: dom.currentPosition,
    targetName,
    targetTag: dom.currentTarget.tagName.toLowerCase(),
  });

  const lockedEl = dom.currentTarget;
  const lockedPos = dom.currentPosition;
  const cb = mode.kind === 'browse' ? mode.onLocked : null;
  cleanup();
  if (cb) cb(lockedEl, lockedPos);
}

function handleGenericInsertClick(e: MouseEvent): void {
  if (!dom.currentTarget || !dom.currentPosition) {
    cleanup();
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  const target = dom.currentTarget;
  const position = dom.currentPosition;
  const cb = mode.kind === 'generic-insert' ? mode.callback : null;
  cleanup();
  if (cb) cb(target, position);
}

function handleComponentInsertClick(e: MouseEvent): void {
  if (!dom.currentTarget || !dom.currentPosition) {
    cleanup();
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  if (mode.kind !== 'component-insert') return;

  const { componentName: cName, storyId: sId, ghostHtml: gHtml, componentPath: cPath, componentArgs: cArgs } = mode;

  const template = document.createElement('template');
  template.innerHTML = gHtml.trim();
  const inserted = template.content.firstElementChild as HTMLElement | null;
  if (!inserted) {
    cleanup();
    sendTo('panel', { type: 'COMPONENT_DISARMED' });
    return;
  }
  inserted.dataset.twDroppedComponent = cName;

  const target = dom.currentTarget;
  const position = dom.currentPosition;

  switch (position) {
    case 'before':
      target.insertAdjacentElement('beforebegin', inserted);
      break;
    case 'after':
      target.insertAdjacentElement('afterend', inserted);
      break;
    case 'first-child':
      target.insertAdjacentElement('afterbegin', inserted);
      break;
    case 'last-child':
      target.appendChild(inserted);
      break;
  }

  const targetSelector = buildSelector(target);

  const isGhostTarget = !!target.dataset.twDroppedComponent;
  const ghostTargetPatchId = target.dataset.twDroppedPatchId;
  const ghostTargetName = target.dataset.twDroppedComponent;
  const ghostAncestor = !isGhostTarget ? findGhostAncestor(target) : null;
  const effectiveGhostName = isGhostTarget ? ghostTargetName : ghostAncestor?.dataset.twDroppedComponent;
  const effectiveGhostPatchId = isGhostTarget ? ghostTargetPatchId : ghostAncestor?.dataset.twDroppedPatchId;

  const context = effectiveGhostName
    ? `Place "${cName}" ${position} the <${effectiveGhostName} /> component (pending insertion from an earlier drop)`
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
    component: { name: cName },
    target: isGhostTarget
      ? { tag: ghostTargetName?.toLowerCase() ?? 'unknown', classes: '', innerText: '' }
      : {
          tag: target.tagName.toLowerCase(),
          classes: target.className,
          innerText: target.innerText.slice(0, 100),
        },
    ghostHtml: gHtml,
    componentStoryId: sId,
    componentPath: cPath || undefined,
    componentArgs: Object.keys(cArgs).length > 0 ? cArgs : undefined,
    parentComponent,
    insertMode: position,
    context,
    ...(effectiveGhostPatchId ? { targetPatchId: effectiveGhostPatchId, targetComponentName: effectiveGhostName } : {}),
  };

  inserted.dataset.twDroppedPatchId = patch.id;

  send({ type: 'COMPONENT_DROPPED', patch });
  sendTo('panel', { type: 'COMPONENT_DISARMED' });

  cleanup();
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

// ── Cleanup (mode-agnostic) ──────────────────────────────────────────────

function cleanup(): void {
  mode = { kind: 'idle' };
  document.documentElement.style.cursor = '';

  document.removeEventListener('mousemove', onMouseMove);
  document.documentElement.removeEventListener('mouseleave', onMouseLeave);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown);

  if (dom.cursorLabel) { dom.cursorLabel.remove(); dom.cursorLabel = null; }
  if (dom.indicator) { dom.indicator.remove(); dom.indicator = null; }
  if (dom.outlineEl) { dom.outlineEl.remove(); dom.outlineEl = null; }
  dom.arrowLeft = null;
  dom.arrowRight = null;
  dom.currentTarget = null;
  dom.currentPosition = null;
}
