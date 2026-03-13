import type { IContainer } from './IContainer';

export class SidebarContainer implements IContainer {
  readonly name = 'sidebar' as const;
  private host: HTMLElement | null = null;
  private originalPadding: string = '';
  private width = 380;

  constructor(private shadowRoot: ShadowRoot) {}

  open(panelUrl: string): void {
    if (this.host) return;

    // Save and override html padding to make room for sidebar
    this.originalPadding = document.documentElement.style.paddingRight;
    document.documentElement.style.paddingRight = `${this.width}px`;

    const host = document.createElement('div');
    host.className = 'container-sidebar';
    host.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: ${this.width}px;
      height: 100vh;
      z-index: 999999;
      background: #1e1e2e;
      box-shadow: -4px 0 24px rgba(0,0,0,0.3);
      display: flex;
    `;

    // Resize handle on left edge
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      width: 6px;
      cursor: ew-resize;
      background: transparent;
      flex-shrink: 0;
    `;
    resizeHandle.addEventListener('mouseenter', () => { resizeHandle.style.background = '#45475a'; });
    resizeHandle.addEventListener('mouseleave', () => { resizeHandle.style.background = 'transparent'; });
    this.setupResize(resizeHandle, host);
    host.appendChild(resizeHandle);

    const iframe = document.createElement('iframe');
    iframe.src = panelUrl;
    iframe.style.cssText = 'flex:1; border:none; height:100%;';
    host.appendChild(iframe);

    this.shadowRoot.appendChild(host);
    this.host = host;
  }

  close(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
      document.documentElement.style.paddingRight = this.originalPadding;
    }
  }

  isOpen(): boolean {
    return this.host !== null;
  }

  private setupResize(handle: HTMLElement, host: HTMLElement): void {
    let startX = 0, startW = 0;

    const onMove = (e: MouseEvent) => {
      this.width = Math.max(280, startW - (e.clientX - startX));
      host.style.width = `${this.width}px`;
      document.documentElement.style.paddingRight = `${this.width}px`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = this.width;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}
