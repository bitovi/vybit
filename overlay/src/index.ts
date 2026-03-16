import { connect, send, sendTo, onMessage } from './ws';
import { getFiber, findComponentBoundary, getRootFiber, findAllInstances, getChildPath, resolvePathToDOM, findInlineRepeatedNodes } from './fiber';
import { parseClasses } from './class-parser';
import { buildContext } from './context';
import { applyPreview, revertPreview, getPreviewState } from './patcher';
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

// Container management
let containers: Record<ContainerName, IContainer>;
let activeContainer: IContainer;

const OVERLAY_CSS = `
  .toggle-btn {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid #DFE2E2;
    cursor: pointer;
    z-index: 999999;
    background: #F4F5F5;
    color: #687879;
    font-size: 18px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .toggle-btn:hover {
    background: #E6E9E9;
    border-color: #00848B;
    color: #00848B;
  }
  .toggle-btn.active {
    background: #F5532D;
    border-color: #F5532D;
    color: #fff;
    box-shadow: 0 0 0 4px rgba(245, 83, 45, 0.09), 0 2px 8px rgba(0,0,0,0.10);
  }
  .toggle-btn.active:hover {
    background: #C73D26;
    border-color: #C73D26;
  }
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
  .highlight-overlay {
    position: fixed;
    pointer-events: none;
    border: 2px solid rgba(0, 132, 139, 0.5);
    background: rgba(0, 132, 139, 0.08);
    z-index: 999998;
    transition: all 0.15s ease;
  }
  .draw-btn {
    position: fixed;
    z-index: 999999;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #DFE2E2;
    background: #F4F5F5;
    color: #00848B;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
    pointer-events: auto;
  }
  .draw-btn:hover {
    background: #E6E9E9;
    border-color: #00848B;
    transform: scale(1.08);
  }
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
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  shadowRoot.appendChild(overlay);
}

function clearHighlights(): void {
  shadowRoot.querySelectorAll('.highlight-overlay').forEach((el) => el.remove());
  removeDrawButton();
}

// Draw button + popover shown on the selected element
let drawBtnEl: HTMLElement | null = null;
let drawPopoverEl: HTMLElement | null = null;

function removeDrawButton(): void {
  drawBtnEl?.remove();
  drawBtnEl = null;
  drawPopoverEl?.remove();
  drawPopoverEl = null;
}

function showDrawButton(targetEl: HTMLElement): void {
  removeDrawButton();

  const rect = targetEl.getBoundingClientRect();

  // Pencil button at top-left of the element
  const btn = document.createElement('button');
  btn.className = 'draw-btn';
  btn.innerHTML = '✏';
  btn.title = 'Insert drawing canvas';
  btn.style.left = `${Math.max(0, rect.left - 34)}px`;
  btn.style.top = `${rect.top - 2}px`;

  drawBtnEl = btn;
  shadowRoot.appendChild(btn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (drawPopoverEl) {
      drawPopoverEl.remove();
      drawPopoverEl = null;
    } else {
      showDrawPopover(btn);
    }
  });
}

function showDrawPopover(anchorBtn: HTMLElement): void {
  drawPopoverEl?.remove();

  const btnRect = anchorBtn.getBoundingClientRect();

  const popover = document.createElement('div');
  popover.className = 'draw-popover';
  popover.style.left = `${btnRect.right + 6}px`;
  popover.style.top = `${btnRect.top}px`;

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
  if (!fiber) {
    showToast('Could not detect a React component for this element.');
    return;
  }

  const boundary = findComponentBoundary(fiber);
  if (!boundary) {
    showToast('Could not detect a React component for this element.');
    return;
  }

  const rootFiber = getRootFiber();
  if (!rootFiber) {
    showToast('Could not find React root.');
    return;
  }

  const instances = findAllInstances(rootFiber, boundary.componentType);
  const path = getChildPath(boundary.componentFiber, fiber);

  clearHighlights();

  const equivalentNodes: HTMLElement[] = [];
  for (const inst of instances) {
    const node = resolvePathToDOM(inst, path);
    if (node) {
      equivalentNodes.push(node);
      highlightElement(node);
    }
  }

  // Fallback: if only one node found, the element is probably rendered inline via .map()
  // without its own React component. Walk the fiber tree within the boundary to find the
  // level with the most same-type siblings and resolve equivalent DOM nodes from each.
  if (equivalentNodes.length <= 1) {
    const repeated = findInlineRepeatedNodes(fiber, boundary.componentFiber);
    if (repeated.length > 0) {
      clearHighlights();
      equivalentNodes.length = 0;
      for (const node of repeated) {
        equivalentNodes.push(node);
        highlightElement(node);
      }
    }
  }

  console.log(`[overlay] ${boundary.componentName} — ${instances.length} instances, ${equivalentNodes.length} highlighted`);

  // Fetch tailwind config (cached after first fetch)
  const config = await fetchTailwindConfig();

  // Parse classes on the clicked element
  const targetEl = target as HTMLElement;
  const classString = targetEl.className;
  if (typeof classString !== 'string') return;
  const parsedClasses = parseClasses(classString);
  if (parsedClasses.length === 0) return;

  // Store selection state for Patcher WS handlers
  currentEquivalentNodes = equivalentNodes;
  currentTargetEl = targetEl;
  currentBoundary = { componentName: boundary.componentName };

  // Show the draw button at the top-left of the selected element
  showDrawButton(targetEl);

  // Open the container if not already open
  const panelUrl = `${SERVER_ORIGIN}/panel`;
  if (!activeContainer.isOpen()) {
    activeContainer.open(panelUrl);
  }

  // Send element data to Panel via WS
  sendTo('panel', {
    type: 'ELEMENT_SELECTED',
    componentName: boundary.componentName,
    instanceCount: equivalentNodes.length,
    classes: classString,
    tailwindConfig: config,
  });
}

function toggleInspect(btn: HTMLButtonElement): void {
  active = !active;
  if (active) {
    btn.classList.add('active');
    document.documentElement.style.cursor = 'crosshair';
    document.addEventListener('click', clickHandler, { capture: true });
    // Open the container
    const panelUrl = `${SERVER_ORIGIN}/panel`;
    if (!activeContainer.isOpen()) {
      activeContainer.open(panelUrl);
    }
  } else {
    btn.classList.remove('active');
    document.documentElement.style.cursor = '';
    document.removeEventListener('click', clickHandler, { capture: true });
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
  shadowHost.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
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
  btn.textContent = '⊕';
  btn.addEventListener('click', () => toggleInspect(btn));
  shadowRoot.appendChild(btn);

  // WebSocket connection — derive WS URL from script src
  const wsUrl = SERVER_ORIGIN.replace(/^http/, 'ws');
  connect(wsUrl);

  // Handle messages from Panel via WS
  onMessage((msg: any) => {
    if (msg.type === 'PATCH_PREVIEW' && currentEquivalentNodes.length > 0) {
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
