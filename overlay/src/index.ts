import { computePosition, flip, offset } from '@floating-ui/dom';
import { connect, send, sendTo, onMessage } from './ws';
import { getFiber, findComponentBoundary, getRootFiber, findAllInstances, getChildPath, resolvePathToDOM, findInlineRepeatedNodes, findDOMEquivalents } from './fiber';
import { parseClasses } from './class-parser';
import { buildContext } from './context';
import { applyPreview, revertPreview, getPreviewState, commitPreview } from './patcher';
import type { IContainer, ContainerName } from './containers/IContainer';
import type { InsertMode } from './messages';
import { PopoverContainer } from './containers/PopoverContainer';
import { ModalContainer } from './containers/ModalContainer';
import { SidebarContainer } from './containers/SidebarContainer';
import { PopupContainer } from './containers/PopupContainer';

let shadowRoot: ShadowRoot;
let shadowHost: HTMLElement;
let active = false;
let wasConnected = false;
let tailwindConfigCache: any = null;

// Current selection state for Patcher WS handlers
let currentEquivalentNodes: HTMLElement[] = [];
let currentTargetEl: HTMLElement | null = null;
let currentBoundary: { componentName: string } | null = null;
let currentInstances: Array<{ index: number; label: string; parent: string }> = [];

// Whether the next click should add to the current selection instead of replacing it
let addingMode = false;

// Hover preview state (shown while selection mode is active + mouse moves)
let hoverOutlineEl: HTMLElement | null = null;
let hoverTooltipEl: HTMLElement | null = null;
let lastHoveredEl: Element | null = null;
let lastMoveTime = 0;

// Container management
let containers: Record<ContainerName, IContainer>;
let activeContainer: IContainer;

const OVERLAY_CSS = `
  .toggle-btn {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1.5px solid #DFE2E2;
    cursor: pointer;
    z-index: 999999;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    animation: vybit-breathe 3s ease-in-out infinite;
    pointer-events: auto;
  }
  @keyframes vybit-breathe {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,132,139,0), 0 2px 8px rgba(0,0,0,0.08); }
    50%       { box-shadow: 0 0 0 3px rgba(0,132,139,0.09), 0 0 12px rgba(0,132,139,0.07), 0 2px 8px rgba(0,0,0,0.08); }
  }
  .toggle-btn:hover {
    border-color: #00848B;
    transform: scale(1.08);
    animation: none;
    box-shadow: 0 0 0 5px rgba(0,132,139,0.12), 0 0 18px rgba(0,132,139,0.12), 0 2px 8px rgba(0,0,0,0.10);
  }
  .toggle-btn:active { transform: scale(0.95); }
  .toggle-btn svg { display: block; }
  .toggle-btn .eb-fill { fill: #00848B; }
  @keyframes rainbow-eyes {
    0%   { fill: #ff4040; }
    14%  { fill: #ff9800; }
    28%  { fill: #ffee00; }
    42%  { fill: #3dff6e; }
    57%  { fill: #00bfff; }
    71%  { fill: #5050ff; }
    85%  { fill: #cc44ff; }
    100% { fill: #ff4040; }
  }
  .toggle-btn:hover .eb-eye-l { animation: rainbow-eyes 1.8s linear infinite; }
  .toggle-btn:hover .eb-eye-r { animation: rainbow-eyes 1.8s linear infinite; animation-delay: -0.45s; }
  .toast {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #00464A;
    color: #F4F5F5;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-family: 'Inter', system-ui, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .toast.visible {
    opacity: 1;
  }
  @keyframes highlight-pulse {
    0%, 100% { border-color: #00848B; box-shadow: 0 0 6px rgba(0,132,139,0.5); }
    50%       { border-color: #F5532D; box-shadow: 0 0 6px rgba(245,83,45,0.5); }
  }
  .highlight-overlay {
    position: fixed;
    pointer-events: none;
    border: 2px solid #00848B;
    border-radius: 2px;
    box-sizing: border-box;
    z-index: 999998;
    animation: highlight-pulse 2s ease-in-out infinite;
  }
  /* Hover preview — lightweight outline shown while selection mode is active */
  .hover-target-outline {
    position: fixed;
    pointer-events: none;
    border: 2px solid #00848B;
    border-radius: 2px;
    box-sizing: border-box;
    z-index: 999999;
    transition: top 80ms ease, left 80ms ease, width 80ms ease, height 80ms ease;
  }
  .hover-tooltip {
    position: fixed;
    pointer-events: none;
    z-index: 1000000;
    background: #003D40;
    color: #E0F5F6;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hover-tooltip .ht-dim { opacity: 0.55; }
  /* ── Element toolbar — single connected dark bar ── */
  .el-toolbar {
    position: fixed;
    z-index: 999999;
    display: flex;
    align-items: stretch;
    background: #003D40;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,0.28);
    pointer-events: auto;
    height: 30px;
  }
  .el-toolbar-sep {
    width: 1px;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
    align-self: stretch;
  }
  /* Base style for all buttons inside the toolbar */
  .draw-btn, .el-pick-btn, .el-add-btn {
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    color: #E0F5F6;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 10px;
    height: 30px;
    white-space: nowrap;
    transition: background 0.12s;
    pointer-events: auto;
  }
  .draw-btn { padding: 0 9px; }
  .el-pick-btn { gap: 3px; padding: 0 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
  .el-pick-btn svg { opacity: 0.7; flex-shrink: 0; }
  .el-add-btn { padding: 0 10px; font-size: 15px; font-weight: 400; }
  .draw-btn:hover, .el-pick-btn:hover, .el-add-btn:hover,
  .el-pick-btn.open {
    background: rgba(255,255,255,0.12);
  }
  /* ── Instance picker popover ── */
  .el-picker {
    position: fixed;
    z-index: 1000000;
    background: #fff;
    border: 1px solid #DFE2E2;
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.14);
    min-width: 240px;
    max-width: 320px;
    font-family: 'Inter', system-ui, sans-serif;
    pointer-events: auto;
    overflow: hidden;
  }
  .el-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 6px;
    border-bottom: 1px solid #DFE2E2;
  }
  .el-picker-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #687879;
  }
  .el-picker-actions {
    display: flex;
    gap: 8px;
  }
  .el-picker-actions a {
    font-size: 10px;
    color: #00848B;
    cursor: pointer;
    text-decoration: none;
    font-weight: 500;
  }
  .el-picker-actions a:hover { text-decoration: underline; }
  .el-picker-list {
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .el-picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .el-picker-row:hover { background: rgba(0,132,139,0.05); }
  .el-picker-row input[type=checkbox] {
    accent-color: #00848B;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .el-picker-badge {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid #DFE2E2;
    background: #F4F5F5;
    color: #687879;
    font-size: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .el-picker-badge.checked {
    border-color: #00848B;
    background: rgba(0,132,139,0.08);
    color: #00848B;
  }
  .el-picker-label {
    flex: 1;
    font-size: 11px;
    color: #334041;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .el-picker-tag {
    font-size: 9px;
    color: #A3ADAD;
    font-weight: 400;
  }
  .el-picker-footer {
    padding: 6px 10px;
    border-top: 1px solid #DFE2E2;
    display: flex;
    justify-content: flex-end;
  }
  .el-picker-apply {
    height: 26px;
    padding: 0 12px;
    border-radius: 5px;
    border: none;
    background: #00848B;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .el-picker-apply:hover { background: #006E74; }
  .draw-popover {
    position: fixed;
    z-index: 999999;
    background: #fff;
    border: 1px solid #DFE2E2;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    padding: 6px 0;
    min-width: 210px;
    font-family: 'Inter', system-ui, sans-serif;
    pointer-events: auto;
  }
  .draw-popover-header {
    padding: 6px 14px 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #687879;
  }
  .draw-popover-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    font-size: 13px;
    color: #1a2b2c;
    cursor: pointer;
    transition: background 0.1s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }
  .draw-popover-item:hover {
    background: rgba(0, 132, 139, 0.06);
  }
  .draw-popover-item:hover .draw-popover-icon {
    color: #00848B;
    background: rgba(0, 132, 139, 0.08);
    border-color: #00848B;
  }
  .draw-popover-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid #DFE2E2;
    background: #F4F5F5;
    color: #687879;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.1s;
    flex-shrink: 0;
  }
  .draw-popover-label {
    flex: 1;
    font-weight: 500;
  }
  .draw-popover-hint {
    font-size: 10px;
    color: #9DAAAB;
    font-weight: 400;
  }
`;

function highlightElement(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'highlight-overlay';
  overlay.style.top = `${rect.top - 3}px`;
  overlay.style.left = `${rect.left - 3}px`;
  overlay.style.width = `${rect.width + 6}px`;
  overlay.style.height = `${rect.height + 6}px`;
  shadowRoot.appendChild(overlay);
}

function clearHighlights(): void {
  shadowRoot.querySelectorAll('.highlight-overlay').forEach((el) => el.remove());
  removeDrawButton();
}

// Element toolbar (wraps draw button + matching controls) shown on selected element
let toolbarEl: HTMLElement | null = null;
let drawPopoverEl: HTMLElement | null = null;
let pickerEl: HTMLElement | null = null;
let pickerCloseHandler: ((e: MouseEvent) => void) | null = null;
let selectedInstanceIndices: Set<number> = new Set();

function removeDrawButton(): void {
  toolbarEl?.remove();
  toolbarEl = null;
  drawPopoverEl?.remove();
  drawPopoverEl = null;
  pickerEl?.remove();
  pickerEl = null;
}

// ── Hover preview ─────────────────────────────────────────────

function clearHoverPreview(): void {
  hoverOutlineEl?.remove(); hoverOutlineEl = null;
  hoverTooltipEl?.remove(); hoverTooltipEl = null;
  lastHoveredEl = null;
}

function showHoverPreview(el: HTMLElement, componentName: string): void {
  const rect = el.getBoundingClientRect();

  if (!hoverOutlineEl) {
    hoverOutlineEl = document.createElement('div');
    hoverOutlineEl.className = 'hover-target-outline';
    shadowRoot.appendChild(hoverOutlineEl);
  }
  hoverOutlineEl.style.top = `${rect.top - 3}px`;
  hoverOutlineEl.style.left = `${rect.left - 3}px`;
  hoverOutlineEl.style.width = `${rect.width + 6}px`;
  hoverOutlineEl.style.height = `${rect.height + 6}px`;

  if (!hoverTooltipEl) {
    hoverTooltipEl = document.createElement('div');
    hoverTooltipEl.className = 'hover-tooltip';
    shadowRoot.appendChild(hoverTooltipEl);
  }
  const tag = el.tagName.toLowerCase();
  const cls = (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '') ?? '';
  hoverTooltipEl.innerHTML = `<span class="ht-dim">&lt;</span>${componentName}<span class="ht-dim">&gt;</span> <span class="ht-dim">${tag}${cls ? `.${cls}` : ''}</span>`;

  // Position tooltip just above the element (with 6px gap)
  const tooltipHeight = 24; // approximate before DOM paint
  const ttTop = rect.top - tooltipHeight - 6;
  hoverTooltipEl.style.top = `${ttTop < 4 ? rect.bottom + 6 : ttTop}px`;
  hoverTooltipEl.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 200))}px`;
}

function mouseMoveHandler(e: MouseEvent): void {
  const now = Date.now();
  if (now - lastMoveTime < 16) return;
  lastMoveTime = now;

  // Ignore events originating from our shadow DOM
  const composed = e.composedPath();
  if (composed.some((n) => n === shadowHost)) { clearHoverPreview(); return; }

  const target = e.target as Element;
  if (!target || !(target instanceof HTMLElement)) { clearHoverPreview(); return; }
  if (target === lastHoveredEl) return;
  lastHoveredEl = target;

  const rect = target.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) { clearHoverPreview(); return; }

  const fiber = getFiber(target);
  const boundary = fiber ? findComponentBoundary(fiber) : null;
  const label = boundary?.componentName ?? target.tagName.toLowerCase();

  showHoverPreview(target, label);
}

const PENCIL_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
</svg>`;

const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

async function positionWithFlip(anchor: HTMLElement, floating: HTMLElement, placement: 'top-start' | 'bottom-start' = 'top-start'): Promise<void> {
  const { x, y } = await computePosition(anchor, floating, {
    placement,
    middleware: [offset(6), flip()],
  });
  floating.style.left = `${x}px`;
  floating.style.top = `${y}px`;
}

function showDrawButton(targetEl: HTMLElement): void {
  removeDrawButton();

  // Snapshot the full node list at selection time so the picker can subset it
  const allEquivalentNodes = [...currentEquivalentNodes];
  const instanceCount = allEquivalentNodes.length;

  // ── Build toolbar ──────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'el-toolbar';
  // Initial position (will be updated by floating-ui)
  toolbar.style.left = '0px';
  toolbar.style.top = '0px';
  shadowRoot.appendChild(toolbar);
  toolbarEl = toolbar;

  // Draw button
  const drawBtn = document.createElement('button');
  drawBtn.className = 'draw-btn';
  drawBtn.innerHTML = PENCIL_SVG;
  drawBtn.title = 'Insert drawing canvas';
  toolbar.appendChild(drawBtn);

  drawBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pickerEl?.remove(); pickerEl = null;
    if (drawPopoverEl) {
      drawPopoverEl.remove();
      drawPopoverEl = null;
    } else {
      showDrawPopover(drawBtn);
    }
  });

  // Show count + picker button if there are 2+ instances
  if (instanceCount > 1) {
    const sep = document.createElement('div');
    sep.className = 'el-toolbar-sep';
    toolbar.appendChild(sep);

    // Single count button — shows N selected, click to pick
    const countBtn = document.createElement('button');
    countBtn.className = 'el-pick-btn';
    const updateCountBtn = (n: number) => {
      countBtn.innerHTML = `${n} ${CHEVRON_SVG}`;
    };
    updateCountBtn(instanceCount);
    countBtn.title = 'Select which instances to edit';
    toolbar.appendChild(countBtn);

    countBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      drawPopoverEl?.remove(); drawPopoverEl = null;
      if (pickerEl) {
        pickerEl.remove(); pickerEl = null;
        countBtn.classList.remove('open');
      } else {
        countBtn.classList.add('open');
        showInstancePicker(
          countBtn,
          () => countBtn.classList.remove('open'),
          (indices) => {
            // Update the active node set and re-draw highlights
            currentEquivalentNodes = indices.map((i) => allEquivalentNodes[i]).filter(Boolean) as HTMLElement[];
            shadowRoot.querySelectorAll('.highlight-overlay').forEach((el) => el.remove());
            currentEquivalentNodes.forEach((n) => highlightElement(n));
            updateCountBtn(currentEquivalentNodes.length);
          },
        );
      }
    });

    // "+" add different element button
    const addBtn = document.createElement('button');
    addBtn.className = 'el-add-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add a different element to selection';
    toolbar.appendChild(addBtn);

    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pickerEl?.remove(); pickerEl = null;
      drawPopoverEl?.remove(); drawPopoverEl = null;
      addingMode = true;
      setSelectMode(true);
      showToast('Click another element to add it to the selection', 2500);
    });
  }

  // Position toolbar using @floating-ui/dom
  // We need a real DOM element as the anchor; use the targetEl itself
  positionWithFlip(targetEl, toolbar);
}

function showInstancePicker(anchorBtn: HTMLElement, onClose: () => void, onApply?: (indices: number[]) => void): void {
  // Remove any stale outside-click handler from a previous open
  if (pickerCloseHandler) {
    document.removeEventListener('click', pickerCloseHandler, { capture: true });
    pickerCloseHandler = null;
  }
  pickerEl?.remove();

  const instances = currentInstances;
  // Restore previous selection if it matches this instance list, otherwise default to all
  const allIndices = instances.map((_, i) => i);
  const selected = new Set<number>(
    selectedInstanceIndices.size > 0 && selectedInstanceIndices.size <= instances.length
      ? [...selectedInstanceIndices].filter((i) => i < instances.length)
      : allIndices
  );

  const picker = document.createElement('div');
  picker.className = 'el-picker';
  picker.style.left = '0px';
  picker.style.top = '0px';
  shadowRoot.appendChild(picker);
  pickerEl = picker;

  // Header
  const header = document.createElement('div');
  header.className = 'el-picker-header';
  const title = document.createElement('span');
  title.className = 'el-picker-title';
  title.textContent = currentBoundary?.componentName ?? 'Instances';
  const actions = document.createElement('div');
  actions.className = 'el-picker-actions';
  const allLink = document.createElement('a');
  allLink.textContent = 'All';
  const noneLink = document.createElement('a');
  noneLink.textContent = 'None';
  actions.appendChild(allLink);
  actions.appendChild(noneLink);
  header.appendChild(title);
  header.appendChild(actions);
  picker.appendChild(header);

  // List
  const list = document.createElement('div');
  list.className = 'el-picker-list';
  picker.appendChild(list);

  const checkboxes: HTMLInputElement[] = [];

  function renderRows() {
    list.innerHTML = '';
    checkboxes.length = 0;
    instances.forEach((inst, i) => {
      const row = document.createElement('label');
      row.className = 'el-picker-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(i);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(i); else selected.delete(i);
        badge.className = 'el-picker-badge' + (cb.checked ? ' checked' : '');
        updateApply();
      });
      checkboxes.push(cb);

      const badge = document.createElement('span');
      badge.className = 'el-picker-badge' + (cb.checked ? ' checked' : '');
      badge.textContent = String(i + 1);

      const label = document.createElement('span');
      label.className = 'el-picker-label';
      label.innerHTML = `${inst.label} <span class="el-picker-tag">${inst.parent}</span>`;

      row.appendChild(cb);
      row.appendChild(badge);
      row.appendChild(label);
      list.appendChild(row);
    });
  }

  renderRows();

  allLink.addEventListener('click', () => {
    instances.forEach((_, i) => selected.add(i));
    renderRows();
    updateApply();
  });
  noneLink.addEventListener('click', () => {
    selected.clear();
    renderRows();
    updateApply();
  });

  // Footer
  const footer = document.createElement('div');
  footer.className = 'el-picker-footer';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'el-picker-apply';
  footer.appendChild(applyBtn);
  picker.appendChild(footer);

  function updateApply() {
    applyBtn.textContent = `Apply (${selected.size} selected)`;
  }
  updateApply();

  const removePicker = () => {
    if (pickerCloseHandler) {
      document.removeEventListener('click', pickerCloseHandler, { capture: true });
      pickerCloseHandler = null;
    }
    pickerEl?.remove(); pickerEl = null;
  };

  applyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const selectedIndices = [...selected];
    selectedInstanceIndices = new Set(selectedIndices); // persist for next open
    sendTo('panel', { type: 'SELECT_MATCHING', indices: selectedIndices });
    onApply?.(selectedIndices);
    removePicker();
    onClose();
  });

  // Position using floating-ui (prefers top-start, flips to bottom-start)
  positionWithFlip(anchorBtn, picker);

  // Close on outside click
  setTimeout(() => {
    pickerCloseHandler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (!path.includes(picker) && !path.includes(anchorBtn)) {
        removePicker();
        onClose();
      }
    };
    document.addEventListener('click', pickerCloseHandler, { capture: true });
  }, 0);
}

function showDrawPopover(anchorBtn: HTMLElement): void {
  drawPopoverEl?.remove();

  const popover = document.createElement('div');
  popover.className = 'draw-popover';
  popover.style.left = '0px';
  popover.style.top = '0px';

  const header = document.createElement('div');
  header.className = 'draw-popover-header';
  header.textContent = 'Insert Drawing Canvas';
  popover.appendChild(header);

  const items: { mode: InsertMode; icon: string; label: string; hint: string }[] = [
    { mode: 'before', icon: '↑', label: 'Before element', hint: 'sibling' },
    { mode: 'after', icon: '↓', label: 'After element', hint: 'sibling' },
    { mode: 'first-child', icon: '⤒', label: 'First child', hint: 'child' },
    { mode: 'last-child', icon: '⤓', label: 'Last child', hint: 'child' },
  ];

  for (const item of items) {
    const row = document.createElement('button');
    row.className = 'draw-popover-item';
    row.innerHTML = `
      <span class="draw-popover-icon">${item.icon}</span>
      <span class="draw-popover-label">${item.label}</span>
      <span class="draw-popover-hint">${item.hint}</span>
    `;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      drawPopoverEl?.remove();
      drawPopoverEl = null;
      injectDesignCanvas(item.mode);
    });
    popover.appendChild(row);
  }

  drawPopoverEl = popover;
  shadowRoot.appendChild(popover);

  // Position to the right of the anchor, flipping if needed
  positionWithFlip(anchorBtn, popover, 'top-start');

  // Close popover when clicking outside
  const closeHandler = (e: MouseEvent) => {
    const path = e.composedPath();
    if (!path.includes(popover) && !path.includes(anchorBtn)) {
      drawPopoverEl?.remove();
      drawPopoverEl = null;
      document.removeEventListener('click', closeHandler, { capture: true });
    }
  };
  // Delay so the current click doesn't immediately close it
  setTimeout(() => {
    document.addEventListener('click', closeHandler, { capture: true });
  }, 0);
}
function getServerOrigin(): string {
  const scripts = document.querySelectorAll('script[src*="overlay.js"]');
  for (const s of scripts) {
    const src = (s as HTMLScriptElement).src;
    if (src) {
      try {
        const url = new URL(src);
        return url.origin;
      } catch { /* ignore */ }
    }
  }
  return 'http://localhost:3333';
}

const SERVER_ORIGIN = getServerOrigin();

async function fetchTailwindConfig(): Promise<any> {
  if (tailwindConfigCache) return tailwindConfigCache;
  try {
    const res = await fetch(`${SERVER_ORIGIN}/tailwind-config`);
    tailwindConfigCache = await res.json();
    return tailwindConfigCache;
  } catch (err) {
    console.error('[tw-overlay] Failed to fetch tailwind config:', err);
    return {};
  }
}

async function clickHandler(e: MouseEvent): Promise<void> {
  // Ignore clicks on our own shadow DOM UI
  const composed = e.composedPath();
  if (composed.some((el) => el === shadowHost)) return;

  // Ignore clicks inside an active design canvas wrapper
  if (composed.some((el) => el instanceof HTMLElement && el.hasAttribute('data-tw-design-canvas'))) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as Element;
  const fiber = getFiber(target);
  const boundary = fiber ? findComponentBoundary(fiber) : null;
  const hasFiber = fiber !== null && boundary !== null;

  const newNodes: HTMLElement[] = [];
  let componentName: string;

  if (hasFiber) {
    const rootFiber = getRootFiber();
    if (!rootFiber) {
      showToast('Could not find React root.');
      return;
    }
    const instances = findAllInstances(rootFiber, boundary!.componentType);
    const path = getChildPath(boundary!.componentFiber, fiber);
    for (const inst of instances) {
      const node = resolvePathToDOM(inst, path);
      if (node) newNodes.push(node);
    }
    componentName = boundary!.componentName;
  } else {
    // Non-React page (Astro, plain HTML, etc.) — fall back to DOM-based matching
    const targetEl = target as HTMLElement;
    newNodes.push(...findDOMEquivalents(targetEl));
    componentName = targetEl.tagName.toLowerCase();
  }

  // In add mode, merge new nodes into the existing selection (dedup by reference)
  if (addingMode && currentEquivalentNodes.length > 0) {
    addingMode = false;
    const merged = [...currentEquivalentNodes];
    for (const n of newNodes) {
      if (!merged.includes(n)) merged.push(n);
    }
    clearHighlights();
    merged.forEach((n) => highlightElement(n));
    currentEquivalentNodes = merged;
    selectedInstanceIndices = new Set(); // reset picker
    // Rebuild toolbar anchored to the first (original) target
    if (currentTargetEl) showDrawButton(currentTargetEl);
    sendTo('panel', { type: 'ELEMENT_SELECTED', componentName: currentBoundary?.componentName ?? componentName, instanceCount: merged.length, classes: currentTargetEl?.className ?? '', tailwindConfig: await fetchTailwindConfig() });
    return;
  }

  clearHighlights();

  const equivalentNodes: HTMLElement[] = [];
  for (const node of newNodes) {
    equivalentNodes.push(node);
    highlightElement(node);
  }

  // React fallback: if only one node found, the element may be rendered inline via .map()
  // without its own component boundary — walk the fiber tree to find repeated siblings.
  if (hasFiber && equivalentNodes.length <= 1) {
    const repeated = findInlineRepeatedNodes(fiber, boundary!.componentFiber);
    if (repeated.length > 0) {
      clearHighlights();
      equivalentNodes.length = 0;
      for (const node of repeated) {
        equivalentNodes.push(node);
        highlightElement(node);
      }
    }
  }

  console.log(`[overlay] ${componentName} — ${equivalentNodes.length} highlighted`);

  // Fetch tailwind config (cached after first fetch)
  const config = await fetchTailwindConfig();

  // Parse classes on the clicked element
  const targetEl = target as HTMLElement;
  const classString = targetEl.className;
  if (typeof classString !== 'string') return;

  // Store selection state for Patcher WS handlers
  currentEquivalentNodes = equivalentNodes;
  currentTargetEl = targetEl;
  currentBoundary = { componentName };
  selectedInstanceIndices = new Set(); // reset picker state for new element
  if (hasFiber) {
    const rootFiber = getRootFiber();
    const instances = rootFiber ? findAllInstances(rootFiber, boundary!.componentType) : [];
    currentInstances = instances.map((inst, i) => {
      const domNode = inst.stateNode instanceof HTMLElement ? inst.stateNode : null;
      const label = domNode
        ? (domNode.innerText || '').trim().slice(0, 40) || `#${i + 1}`
        : `#${i + 1}`;
      const parentFiber = inst.return;
      const parent = parentFiber?.type?.name ?? '';
      return { index: i, label, parent };
    });
  } else {
    currentInstances = equivalentNodes.map((node, i) => ({
      index: i,
      label: (node.innerText || '').trim().slice(0, 40) || `#${i + 1}`,
      parent: node.parentElement?.tagName.toLowerCase() ?? '',
    }));
  }

  // Selection complete — deactivate hover preview and selection mode cursor
  clearHoverPreview();
  setSelectMode(false);

  // Show the element toolbar at the top-left of the selected element
  showDrawButton(targetEl);

  // Open the container if not already open
  const panelUrl = `${SERVER_ORIGIN}/panel`;
  if (!activeContainer.isOpen()) {
    activeContainer.open(panelUrl);
  }

  // Send element data to Panel via WS
  sendTo('panel', {
    type: 'ELEMENT_SELECTED',
    componentName,
    instanceCount: equivalentNodes.length,
    classes: classString,
    tailwindConfig: config,
  });
}

function setSelectMode(on: boolean): void {
  if (on) {
    document.documentElement.style.cursor = 'crosshair';
    document.addEventListener('click', clickHandler, { capture: true });
    document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
  } else {
    addingMode = false;
    document.documentElement.style.cursor = '';
    document.removeEventListener('click', clickHandler, { capture: true });
    document.removeEventListener('mousemove', mouseMoveHandler);
    clearHoverPreview();
  }
  sendTo('panel', { type: 'SELECT_MODE_CHANGED', active: on });
}

function toggleInspect(btn: HTMLButtonElement): void {
  active = !active;
  if (active) {
    btn.classList.add('active');
    // Open the container — select mode is activated via the panel's SelectElementButton
    const panelUrl = `${SERVER_ORIGIN}/panel`;
    if (!activeContainer.isOpen()) {
      activeContainer.open(panelUrl);
    }
  } else {
    btn.classList.remove('active');
    setSelectMode(false);
    activeContainer.close();
    revertPreview();
    clearHighlights();
  }
}

export function showToast(message: string, duration: number = 3000): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  shadowRoot.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Active design canvas wrappers (tracked for cleanup)
const designCanvasWrappers: HTMLElement[] = [];

function injectDesignCanvas(insertMode: InsertMode): void {
  if (!currentTargetEl || !currentBoundary) {
    showToast('Select an element first');
    return;
  }

  // Remove selection highlights and draw button
  clearHighlights();

  const targetEl = currentTargetEl;

  // Create the wrapper div inserted into the DOM flow based on insertMode
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-tw-design-canvas', 'true');
  wrapper.style.cssText = `
    border: 2px dashed #00848B;
    border-radius: 6px;
    background: #FAFBFB;
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 400px;
    min-width: 300px;
    min-height: 200px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    box-sizing: border-box;
  `;

  // Create iframe for the design canvas
  const iframe = document.createElement('iframe');
  iframe.src = `${SERVER_ORIGIN}/panel/?mode=design`;
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  `;

  wrapper.appendChild(iframe);

  // Add resize handle at bottom
  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    background: linear-gradient(transparent, rgba(0,132,139,0.06));
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  const resizeBar = document.createElement('div');
  resizeBar.style.cssText = `
    width: 32px;
    height: 3px;
    border-radius: 2px;
    background: #DFE2E2;
  `;
  resizeHandle.appendChild(resizeBar);
  wrapper.appendChild(resizeHandle);

  // Resize logic (vertical)
  let startY = 0;
  let startHeight = 0;
  const onResizeMove = (e: MouseEvent) => {
    const delta = e.clientY - startY;
    const newHeight = Math.max(150, startHeight + delta);
    wrapper.style.height = `${newHeight}px`;
  };
  const onResizeUp = () => {
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
    document.documentElement.style.cursor = '';
  };
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = wrapper.offsetHeight;
    document.documentElement.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);
  });

  // Add corner resize handle (both axes)
  const cornerHandle = document.createElement('div');
  cornerHandle.style.cssText = `
    position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    z-index: 5;
  `;
  const cornerDeco = document.createElement('div');
  cornerDeco.style.cssText = `
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    border-right: 2px solid #DFE2E2;
    border-bottom: 2px solid #DFE2E2;
  `;
  cornerHandle.appendChild(cornerDeco);
  wrapper.appendChild(cornerHandle);

  let cornerStartX = 0;
  let cornerStartY = 0;
  let cornerStartWidth = 0;
  let cornerStartHeight = 0;
  const onCornerMove = (e: MouseEvent) => {
    const dw = e.clientX - cornerStartX;
    const dh = e.clientY - cornerStartY;
    wrapper.style.width = `${Math.max(200, cornerStartWidth + dw)}px`;
    wrapper.style.height = `${Math.max(150, cornerStartHeight + dh)}px`;
  };
  const onCornerUp = () => {
    document.removeEventListener('mousemove', onCornerMove);
    document.removeEventListener('mouseup', onCornerUp);
    document.documentElement.style.cursor = '';
  };
  cornerHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    cornerStartX = e.clientX;
    cornerStartY = e.clientY;
    cornerStartWidth = wrapper.offsetWidth;
    cornerStartHeight = wrapper.offsetHeight;
    document.documentElement.style.cursor = 'nwse-resize';
    document.addEventListener('mousemove', onCornerMove);
    document.addEventListener('mouseup', onCornerUp);
  });

  // Insert into the DOM based on insertMode
  switch (insertMode) {
    case 'before':
      targetEl.insertAdjacentElement('beforebegin', wrapper);
      break;
    case 'after':
      targetEl.insertAdjacentElement('afterend', wrapper);
      break;
    case 'first-child':
      targetEl.insertAdjacentElement('afterbegin', wrapper);
      break;
    case 'last-child':
      targetEl.appendChild(wrapper);
      break;
    default:
      targetEl.insertAdjacentElement('beforebegin', wrapper);
  }

  designCanvasWrappers.push(wrapper);

  // After iframe loads, send element context via WS
  // Use a short delay to allow the iframe's WS client to connect and register
  iframe.addEventListener('load', () => {
    const contextMsg = {
      type: 'ELEMENT_CONTEXT',
      componentName: currentBoundary?.componentName ?? '',
      instanceCount: currentEquivalentNodes.length,
      target: {
        tag: targetEl.tagName.toLowerCase(),
        classes: typeof targetEl.className === 'string' ? targetEl.className : '',
        innerText: (targetEl.innerText || '').trim().slice(0, 60),
      },
      context: buildContext(targetEl, '', '', new Map()),
      insertMode,
    };
    // Retry a few times so the design iframe's WS has time to register
    let attempts = 0;
    const trySend = () => {
      sendTo('design', contextMsg);
      attempts++;
      if (attempts < 5) setTimeout(trySend, 300);
    };
    setTimeout(trySend, 200);
  });
}

function removeAllDesignCanvases(): void {
  for (const wrapper of designCanvasWrappers) {
    wrapper.remove();
  }
  designCanvasWrappers.length = 0;
}

function getDefaultContainer(): ContainerName {
  try {
    const stored = localStorage.getItem('tw-panel-container');
    if (stored && (stored === 'modal' || stored === 'popover' || stored === 'sidebar' || stored === 'popup')) {
      return stored as ContainerName;
    }
  } catch { /* ignore */ }
  return 'popover';
}

function init(): void {
  shadowHost = document.createElement('div');
  shadowHost.id = 'tw-visual-editor-host';
  shadowHost.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.body.appendChild(shadowHost);

  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);

  // Initialize containers
  containers = {
    popover: new PopoverContainer(shadowRoot),
    modal: new ModalContainer(shadowRoot),
    sidebar: new SidebarContainer(shadowRoot),
    popup: new PopupContainer(),
  };
  activeContainer = containers[getDefaultContainer()];

  const btn = document.createElement('button');
  btn.className = 'toggle-btn';
  btn.setAttribute('aria-label', 'Open VyBit inspector');
  btn.innerHTML = `<svg width="26" height="27" viewBox="0 0 210 221" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="eb-fill" d="M141.54 137.71L103.87 140.38C102.98 140.44 102.2 140.97 101.8 141.77C101.41 142.57 101.47 143.51 101.96 144.25C102.27 144.72 109.46 155.39 121.96 155.39C122.3 155.39 122.65 155.39 123 155.37C138.61 154.64 143.83 141.66 144.05 141.11C144.36 140.31 144.24 139.41 143.73 138.72C143.22 138.03 142.4 137.65 141.54 137.71Z"/>
    <path class="eb-eye-l eb-fill" d="M80.6401 93.03C76.7801 93.22 73.8 96.5 73.99 100.36L74.7501 115.96C74.9401 119.85 78.2701 122.84 82.1501 122.61C85.9801 122.38 88.9101 119.11 88.7301 115.28L87.9701 99.68C87.7801 95.82 84.5001 92.84 80.6401 93.03Z"/>
    <path class="eb-eye-r eb-fill" d="M149.46 96.67L150.32 111.72C150.54 115.58 153.85 118.53 157.71 118.31C161.57 118.09 164.52 114.78 164.3 110.92L163.44 95.87C163.22 92.03 159.94 89.08 156.09 89.28C152.22 89.48 149.24 92.79 149.47 96.67H149.46Z"/>
    <path class="eb-fill" d="M203.62 90.36C200.83 87.64 198.15 86.1 195.79 84.75C194 83.73 192.46 82.84 190.96 81.51C189.22 79.95 187.1 75.74 186.15 73.24C186.14 73.21 186.12 73.17 186.11 73.14C180.84 57.81 173.51 43.77 164.58 32.13C148.57 11.27 129.15 0.16 108.42 0C108.28 0 108.13 0 107.99 0C85.65 0 64.34 13.17 47.95 37.12C42.28 45.4 37.04 56.95 33.2 65.38C32.31 67.35 31.51 69.09 30.84 70.52C29.88 72.54 28.87 74.32 27.74 75.95L21.06 15.98C24.27 14.61 26.42 11.74 26.24 8.54C26 4.26 21.69 1.03 16.61 1.31C11.53 1.59 7.61002 5.29 7.85002 9.57C8.04002 12.85 10.61 15.51 14.09 16.45L16.67 85.85L16.29 86.08C13.19 87.96 9.98002 89.9 7.71002 92.09C4.65002 95.04 2.40002 99.48 1.21002 104.92C-1.62998 117.95 0.120019 138.77 10.82 143.95C18.87 147.85 25.1 154.71 28.83 163.79C42.17 198.91 71.91 219.98 108.4 220.16C108.56 220.16 108.71 220.16 108.87 220.16C133.9 220.16 156.3 210.08 171.97 191.74C183.26 178.53 190.59 161.68 193.54 142.92C194.26 139.76 197.48 136.44 200.62 133.23C204.14 129.62 207.78 125.89 209.22 121.16C210.85 115.82 209.93 96.53 203.62 90.36ZM173.3 73.25C176.99 83.04 179.72 93.27 181.36 103.35C183.29 115.23 183.53 126.81 182.18 137.69C180.99 142.99 176.46 157.5 161.58 165.93C141.26 177.45 110.38 180.84 88.16 174.01C63.16 166.32 48.04 142.7 47.72 110.85C47.39 78.09 63.77 70.45 80.58 65.42C101.92 59.04 133.9 57.44 153.39 61.79C163.19 63.98 168.32 67.53 170.9 70.13C172.08 71.32 172.83 72.4 173.3 73.25ZM162.85 183.94C149.31 199.79 130.66 208.15 108.89 208.15C108.75 208.15 108.61 208.15 108.46 208.15C77.09 207.99 51.5 189.77 40 159.41C39.96 159.32 39.93 159.22 39.89 159.13C36.77 151.59 32.28 145.21 26.65 140.22C26.61 140.17 26.57 140.13 26.53 140.08C23.64 137.25 24.55 133.1 24.74 131.41C26.16 118.65 22.59 108.63 21.57 106.52C20.4 104.1 19.23 105.15 19.49 106.56C19.78 108.18 20.09 110.5 20.28 112.89C21.07 122.72 19.28 131.47 17.02 133.03C16.74 133.22 16.46 133.27 16.16 133.19C16.12 133.17 16.08 133.15 16.04 133.13C13.44 131.87 10.36 119.2 12.92 107.46C13.86 103.16 15.4 101.31 16.02 100.71C17.32 99.45 19.95 97.87 22.48 96.33L23.24 95.87C32.05 90.52 37.38 84.66 41.66 75.64C42.36 74.17 43.18 72.36 44.1 70.33C47.54 62.75 52.75 51.3 57.82 43.89C71.91 23.31 89.7 12 107.96 12C108.07 12 108.18 12 108.29 12C133.67 12.19 154.63 33.4 167.85 60.64C164.47 58.82 160.16 57.16 154.65 55.93C134.31 51.39 101 53.03 78.82 59.67C59.32 65.5 41.33 75.74 41.68 110.91C42.03 145.51 58.73 171.25 86.35 179.75C94.55 182.27 103.85 183.49 113.4 183.49C131.42 183.49 150.35 179.17 164.49 171.16C169.1 168.55 172.84 165.45 175.87 162.21C172.6 170.28 168.23 177.61 162.81 183.95L162.85 183.94ZM197.75 117.65C197.4 118.8 196.34 120.21 195.01 121.7C194.91 115.06 194.32 108.28 193.21 101.43C192.95 99.84 192.67 98.26 192.37 96.69C193.34 97.32 194.27 98.01 195.19 98.9C196.86 101.11 198.85 113.73 197.76 117.66L197.75 117.65Z"/>
  </svg>`;
  btn.addEventListener('click', () => toggleInspect(btn));
  shadowRoot.appendChild(btn);

  // WebSocket connection — derive WS URL from script src
  const wsUrl = SERVER_ORIGIN.replace(/^http/, 'ws');
  connect(wsUrl);

  // Handle messages from Panel via WS
  onMessage((msg: any) => {
    if (msg.type === 'TOGGLE_SELECT_MODE') {
      if (msg.active) {
        setSelectMode(true);
        // Ensure panel is open
        const panelUrl = `${SERVER_ORIGIN}/panel`;
        if (!activeContainer.isOpen()) activeContainer.open(panelUrl);
      } else {
        setSelectMode(false);
      }
    } else if (msg.type === 'PATCH_PREVIEW' && currentEquivalentNodes.length > 0) {
      applyPreview(currentEquivalentNodes, msg.oldClass, msg.newClass, SERVER_ORIGIN);
    } else if (msg.type === 'PATCH_REVERT') {
      revertPreview();
    } else if (msg.type === 'PATCH_STAGE' && currentTargetEl && currentBoundary) {
      // Build context and send PATCH_STAGED to server
      const state = getPreviewState();
      const originalClassMap = new Map<HTMLElement, string>();
      if (state) {
        for (let i = 0; i < state.elements.length; i++) {
          originalClassMap.set(state.elements[i], state.originalClasses[i]);
        }
      }

      const targetElIndex = currentEquivalentNodes.indexOf(currentTargetEl);
      const originalClassString = state && targetElIndex !== -1
        ? state.originalClasses[targetElIndex]
        : currentTargetEl.className;

      const context = buildContext(currentTargetEl, msg.oldClass, msg.newClass, originalClassMap);

      send({
        type: 'PATCH_STAGED',
        patch: {
          id: msg.id,
          elementKey: currentBoundary.componentName,
          status: 'staged',
          originalClass: msg.oldClass,
          newClass: msg.newClass,
          property: msg.property,
          timestamp: new Date().toISOString(),
          pageUrl: window.location.href,
          component: { name: currentBoundary.componentName },
          target: {
            tag: currentTargetEl.tagName.toLowerCase(),
            classes: originalClassString,
            innerText: (currentTargetEl.innerText || '').trim().slice(0, 60),
          },
          context,
        },
      });

      showToast('Change staged');

      // The staged change is now the baseline — clear preview tracking so the
      // next preview captures the current DOM state (with the staged class).
      commitPreview();
    } else if (msg.type === 'CLEAR_HIGHLIGHTS') {
      clearHighlights();
    } else if (msg.type === 'SWITCH_CONTAINER') {
      const newName = msg.container as ContainerName;
      if (containers[newName] && newName !== activeContainer.name) {
        const wasOpen = activeContainer.isOpen();
        activeContainer.close();
        activeContainer = containers[newName];
        if (wasOpen) {
          activeContainer.open(`${SERVER_ORIGIN}/panel`);
        }
      }
    } else if (msg.type === 'INSERT_DESIGN_CANVAS') {
      injectDesignCanvas(msg.insertMode as InsertMode);
    } else if (msg.type === 'DESIGN_SUBMITTED') {
      // Replace the most recent canvas iframe with a static image preview
      const last = designCanvasWrappers[designCanvasWrappers.length - 1];
      if (last) {
        const iframe = last.querySelector('iframe');
        if (iframe && msg.image) {
          const img = document.createElement('img');
          img.src = msg.image;
          img.style.cssText = `
            width: 100%;
            height: auto;
            display: block;
            pointer-events: none;
          `;
          // Remove all children (iframe, resize handles) and show just the image
          last.innerHTML = '';
          last.style.height = 'auto';
          last.style.minHeight = '0';
          last.style.overflow = 'hidden';
          last.appendChild(img);
        }
      }
    } else if (msg.type === 'DESIGN_CLOSE') {
      // Remove the most recently added canvas wrapper
      const last = designCanvasWrappers.pop();
      if (last) last.remove();
    }
  });

  window.addEventListener('resize', () => {
    if (currentEquivalentNodes.length > 0) {
      shadowRoot.querySelectorAll('.highlight-overlay').forEach((el) => el.remove());
      currentEquivalentNodes.forEach((n) => highlightElement(n));
    }
  });

  window.addEventListener('scroll', () => {
    if (currentEquivalentNodes.length > 0) {
      shadowRoot.querySelectorAll('.highlight-overlay').forEach((el) => el.remove());
      currentEquivalentNodes.forEach((n) => highlightElement(n));
    }
  }, { capture: true, passive: true });

  window.addEventListener('overlay-ws-connected', () => {
    if (wasConnected) {
      showToast('Reconnected');
    }
    wasConnected = true;
  });

  window.addEventListener('overlay-ws-disconnected', () => {
    if (wasConnected) {
      showToast('Connection lost — restart the server and refresh.', 5000);
    }
  });
}

export { shadowRoot };

init();
