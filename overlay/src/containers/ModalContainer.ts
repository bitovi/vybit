import type { IContainer } from './IContainer';

const STORAGE_KEY = 'tw-modal-bounds';

interface ModalBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

function loadBounds(): ModalBounds {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { top: 80, left: Math.max(0, window.innerWidth - 440), width: 400, height: 600 };
}

function saveBounds(bounds: ModalBounds): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds)); } catch { /* ignore */ }
}

export class ModalContainer implements IContainer {
  readonly name = 'modal' as const;
  private host: HTMLElement | null = null;
  private bounds: ModalBounds = loadBounds();

  constructor(private shadowRoot: ShadowRoot) {}

  open(panelUrl: string): void {
    if (this.host) return;

    this.bounds = loadBounds();

    const host = document.createElement('div');
    host.className = 'container-modal';
    this.applyBounds(host);
    host.style.position = 'fixed';
    host.style.zIndex = '999999';
    host.style.background = '#1e1e2e';
    host.style.borderRadius = '8px';
    host.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.overflow = 'hidden';

    // Drag handle
    const handle = document.createElement('div');
    handle.style.cssText = `
      height: 28px;
      background: #181825;
      cursor: move;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      user-select: none;
    `;
    handle.innerHTML = '<span style="color:#585b70;font-size:11px;letter-spacing:2px;">⋯⋯⋯</span>';
    this.setupDrag(handle, host);
    host.appendChild(handle);

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.src = panelUrl;
    iframe.style.cssText = 'flex:1; border:none; width:100%;';
    host.appendChild(iframe);

    // Resize gripper
    const gripper = document.createElement('div');
    gripper.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
    `;
    gripper.innerHTML = '<span style="position:absolute;bottom:2px;right:4px;color:#585b70;font-size:10px;">◢</span>';
    this.setupResize(gripper, host, iframe);
    host.appendChild(gripper);

    this.shadowRoot.appendChild(host);
    this.host = host;
  }

  close(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
    }
  }

  isOpen(): boolean {
    return this.host !== null;
  }

  private applyBounds(el: HTMLElement): void {
    el.style.top = `${this.bounds.top}px`;
    el.style.left = `${this.bounds.left}px`;
    el.style.width = `${this.bounds.width}px`;
    el.style.height = `${this.bounds.height}px`;
  }

  private setupDrag(handle: HTMLElement, host: HTMLElement): void {
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onMove = (e: MouseEvent) => {
      this.bounds.left = startLeft + (e.clientX - startX);
      this.bounds.top = startTop + (e.clientY - startY);
      host.style.left = `${this.bounds.left}px`;
      host.style.top = `${this.bounds.top}px`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveBounds(this.bounds);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = this.bounds.left;
      startTop = this.bounds.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  private setupResize(gripper: HTMLElement, host: HTMLElement, iframe: HTMLElement): void {
    let startX = 0, startY = 0, startW = 0, startH = 0;

    const onMove = (e: MouseEvent) => {
      this.bounds.width = Math.max(300, startW + (e.clientX - startX));
      this.bounds.height = Math.max(200, startH + (e.clientY - startY));
      host.style.width = `${this.bounds.width}px`;
      host.style.height = `${this.bounds.height}px`;
    };

    const onUp = () => {
      iframe.style.pointerEvents = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveBounds(this.bounds);
    };

    gripper.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Disable iframe pointer events during resize so mousemove isn't swallowed
      iframe.style.pointerEvents = 'none';
      startX = e.clientX;
      startY = e.clientY;
      startW = this.bounds.width;
      startH = this.bounds.height;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}
