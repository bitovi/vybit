import { connect, send } from './ws';
import { getFiber, findComponentBoundary, getRootFiber, findAllInstances, getChildPath, resolvePathToDOM } from './fiber';
import { parseClasses } from './class-parser';
import { showPicker, closePicker } from './picker';
import { buildContext } from './context';

let shadowRoot: ShadowRoot;
let shadowHost: HTMLElement;
let active = false;
let wasConnected = false;
let tailwindConfigCache: any = null;

// Track original classes for live preview revert
let previewState: { elements: HTMLElement[]; originalClasses: string[] } | null = null;
// Style element injected into document.head for preview CSS
let previewStyleEl: HTMLStyleElement | null = null;

const OVERLAY_CSS = `
  .toggle-btn {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    z-index: 999999;
    background: #e5e7eb;
    color: #374151;
    font-size: 20px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transition: background 0.15s, color 0.15s;
  }
  .toggle-btn:hover {
    background: #d1d5db;
  }
  .toggle-btn.active {
    background: #2563eb;
    color: #fff;
  }
  .toggle-btn.active:hover {
    background: #1d4ed8;
  }
  .toast {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #fff;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-family: system-ui, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .toast.visible {
    opacity: 1;
  }
  .highlight-overlay {
    position: fixed;
    pointer-events: none;
    border: 2px solid rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.1);
    z-index: 999998;
    transition: all 0.15s ease;
  }
  .picker-panel {
    position: fixed;
    background: #1e1e2e;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 8px;
    padding: 12px;
    min-width: 280px;
    max-width: 500px;
    max-height: 600px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 999999;
  }
  .picker-header {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 8px;
    color: #cba6f7;
  }
  .picker-category {
    margin-top: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #a6adc8;
    margin-bottom: 4px;
  }
  .picker-class-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }
  .picker-class-chip {
    padding: 2px 8px;
    border-radius: 4px;
    background: #313244;
    color: #cdd6f4;
    cursor: pointer;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    border: 1px solid transparent;
    transition: all 0.1s;
  }
  .picker-class-chip:hover {
    background: #45475a;
  }
  .picker-class-chip.selected {
    border-color: #cba6f7;
    background: #45475a;
  }
  .picker-scale {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 8px 0;
    padding: 8px;
    background: #181825;
    border-radius: 6px;
  }
  .picker-scale-chip {
    padding: 2px 6px;
    border-radius: 3px;
    background: #313244;
    color: #bac2de;
    cursor: pointer;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    border: 1px solid transparent;
    transition: all 0.1s;
  }
  .picker-scale-chip:hover {
    background: #585b70;
    color: #cdd6f4;
  }
  .picker-scale-chip.current {
    border-color: #89b4fa;
    background: #45475a;
    color: #89b4fa;
  }
  .picker-scale-chip.preview {
    border-color: #a6e3a1;
    background: #45475a;
    color: #a6e3a1;
  }
  .picker-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .picker-btn {
    padding: 6px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .picker-btn-queue {
    background: #a6e3a1;
    color: #1e1e2e;
  }
  .picker-btn-queue:hover {
    background: #94e2d5;
  }
  .picker-btn-discard {
    background: #45475a;
    color: #cdd6f4;
  }
  .picker-btn-discard:hover {
    background: #585b70;
  }
  .color-grid {
    padding: 8px;
    background: #181825;
    border-radius: 6px;
    margin: 8px 0;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 2px;
  }
  .color-hue-label {
    width: 52px;
    font-size: 10px;
    color: #6c7086;
    text-align: right;
    padding-right: 6px;
    flex-shrink: 0;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .color-cell {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.1s, transform 0.1s;
    flex-shrink: 0;
  }
  .color-cell:hover {
    border-color: #cdd6f4;
    transform: scale(1.2);
    z-index: 1;
  }
  .color-cell.current {
    border-color: #89b4fa;
    box-shadow: 0 0 0 1px #89b4fa;
  }
  .color-cell.preview {
    border-color: #a6e3a1;
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

  showPicker({
    shadowRoot,
    anchorElement: targetEl,
    componentName: boundary.componentName,
    instanceCount: instances.length,
    parsedClasses,
    tailwindConfig: config,
    onSelect() {
      clearHighlights();
    },
    async onPreview(oldClass: string, newClass: string) {
      // Save original state on first preview
      if (!previewState) {
        previewState = {
          elements: equivalentNodes,
          originalClasses: equivalentNodes.map(n => n.className),
        };
      }

      // Fetch generated CSS for newClass from the MCP server and inject into
      // document.head so the class has styles even if purged from the user's build.
      try {
        const res = await fetch('http://localhost:3333/css', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classes: [newClass] }),
        });
        const { css } = await res.json() as { css: string };
        if (!previewStyleEl) {
          previewStyleEl = document.createElement('style');
          previewStyleEl.setAttribute('data-tw-preview', '');
          document.head.appendChild(previewStyleEl);
        }
        previewStyleEl.textContent = css;
      } catch {
        // If the server is unavailable, apply the class anyway — it may already exist in the build
      }

      // Apply class swap to all equivalent nodes
      for (const node of equivalentNodes) {
        node.classList.remove(oldClass);
        node.classList.add(newClass);
      }
    },
    onRevert() {
      if (previewState) {
        for (let i = 0; i < previewState.elements.length; i++) {
          previewState.elements[i].className = previewState.originalClasses[i];
        }
        previewState = null;
      }
      previewStyleEl?.remove();
      previewStyleEl = null;
    },
    onQueue(oldClass: string, newClass: string, property: string) {
      // Build a map of element → original className for every previewed node so
      // that buildContext can restore the source-accurate class on the target
      // AND all sibling instances that also had the preview applied.
      const originalClassMap = new Map<HTMLElement, string>();
      if (previewState) {
        for (let i = 0; i < previewState.elements.length; i++) {
          originalClassMap.set(previewState.elements[i], previewState.originalClasses[i]);
        }
      }

      const targetElIndex = equivalentNodes.indexOf(targetEl);
      const originalClassString = previewState && targetElIndex !== -1
        ? previewState.originalClasses[targetElIndex]
        : targetEl.className;

      const context = buildContext(targetEl, oldClass, newClass, originalClassMap);

      send({
        type: 'CHANGE',
        component: {
          name: boundary.componentName,
        },
        target: {
          tag: targetEl.tagName.toLowerCase(),
          classes: originalClassString,
          innerText: (targetEl.innerText || '').trim().slice(0, 60),
        },
        change: {
          property,
          old: oldClass,
          new: newClass,
        },
        context,
      });

      showToast('Change queued — say "apply my changes" to your agent');
    },
    onClose() {
      closePicker(shadowRoot);
      clearHighlights();
      // Revert any lingering preview
      if (previewState) {
        for (let i = 0; i < previewState.elements.length; i++) {
          previewState.elements[i].className = previewState.originalClasses[i];
        }
        previewState = null;
      }
    },
  });
}

function toggleInspect(btn: HTMLButtonElement): void {
  active = !active;
  if (active) {
    btn.classList.add('active');
    document.documentElement.style.cursor = 'crosshair';
    document.addEventListener('click', clickHandler, { capture: true });
  } else {
    btn.classList.remove('active');
    document.documentElement.style.cursor = '';
    document.removeEventListener('click', clickHandler, { capture: true });
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

function init(): void {
  shadowHost = document.createElement('div');
  shadowHost.id = 'tw-visual-editor-host';
  shadowHost.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
  document.body.appendChild(shadowHost);

  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'toggle-btn';
  btn.textContent = '⊕';
  btn.addEventListener('click', () => toggleInspect(btn));
  shadowRoot.appendChild(btn);

  // WebSocket connection — derive WS URL from script src
  const wsUrl = SERVER_ORIGIN.replace(/^http/, 'ws');
  connect(wsUrl);

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
