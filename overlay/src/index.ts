import { connect, send, sendTo, onMessage } from './ws';
import { getFiber, findComponentBoundary, getRootFiber, findAllInstances, getChildPath, resolvePathToDOM } from './fiber';
import { parseClasses } from './class-parser';
import { buildContext } from './context';
import { applyPreview, revertPreview, getPreviewState } from './patcher';
import type { IContainer, ContainerName } from './containers/IContainer';
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

  // Open the container if not already open
  const panelUrl = `${SERVER_ORIGIN}/panel`;
  if (!activeContainer.isOpen()) {
    activeContainer.open(panelUrl);
  }

  // Send element data to Panel via WS
  sendTo('panel', {
    type: 'ELEMENT_SELECTED',
    componentName: boundary.componentName,
    instanceCount: instances.length,
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
    if (msg.type === 'CLASS_PREVIEW' && currentEquivalentNodes.length > 0) {
      applyPreview(currentEquivalentNodes, msg.oldClass, msg.newClass, SERVER_ORIGIN);
    } else if (msg.type === 'CLASS_REVERT') {
      revertPreview();
    } else if (msg.type === 'CLASS_COMMIT' && currentTargetEl && currentBoundary) {
      // Build context and send CHANGE to server
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
        type: 'CHANGE',
        component: { name: currentBoundary.componentName },
        target: {
          tag: currentTargetEl.tagName.toLowerCase(),
          classes: originalClassString,
          innerText: (currentTargetEl.innerText || '').trim().slice(0, 60),
        },
        change: {
          property: msg.property,
          old: msg.oldClass,
          new: msg.newClass,
        },
        context,
      });

      showToast('Change queued — say "apply my changes" to your agent');
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
