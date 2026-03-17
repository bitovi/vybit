import type { IContainer } from './IContainer';

export class SidebarContainer implements IContainer {
  readonly name = 'sidebar' as const;
  private host: HTMLElement | null = null;
  private originalPadding: string = '';
  private width = 380;
  private pageWrapper: HTMLElement | null = null;
  private originalBodyOverflow: string = '';

  constructor(private shadowRoot: ShadowRoot) {}

  open(panelUrl: string): void {
    if (this.host) return;

    // Create a fixed page wrapper that leaves room on the right for the sidebar
    // and becomes the scrollable area. This moves the visible scrollbar to the
    // left of the panel (on the wrapper) instead of being under the sidebar.
    this.originalBodyOverflow = document.body.style.overflow;
    const wrapper = document.createElement('div');
    wrapper.id = 'tw-page-wrapper';
    wrapper.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: ${this.width}px;
      bottom: 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      background: transparent;
      z-index: 0;
    `;

    // Move existing body children (except the overlay host) into the wrapper.
    const bodyChildren = Array.from(document.body.childNodes);
    for (const node of bodyChildren) {
      // Keep the overlay host (if present) outside the wrapper
      if ((node as HTMLElement).id === 'tw-visual-editor-host') continue;
      wrapper.appendChild(node);
    }

    // Insert wrapper before the overlay host so the overlay remains on top
    const shadowHost = document.getElementById('tw-visual-editor-host');
    if (shadowHost && shadowHost.parentNode) {
      shadowHost.parentNode.insertBefore(wrapper, shadowHost);
    } else {
      document.body.appendChild(wrapper);
    }
    // Hide the body's default scrollbar
    document.body.style.overflow = 'hidden';
    this.pageWrapper = wrapper;

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
      pointer-events: auto;
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
      // Restore page wrapper and body overflow
      if (this.pageWrapper) {
        // Move children back to body (before the overlay host)
        const children = Array.from(this.pageWrapper.childNodes);
        const shadowHost = document.getElementById('tw-visual-editor-host');
        for (const node of children) {
          if (shadowHost && shadowHost.parentNode) {
            shadowHost.parentNode.insertBefore(node, shadowHost);
          } else {
            document.body.appendChild(node);
          }
        }
        this.pageWrapper.remove();
        this.pageWrapper = null;
      }
      document.body.style.overflow = this.originalBodyOverflow || '';
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
