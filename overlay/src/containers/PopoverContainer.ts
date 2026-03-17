import type { IContainer } from './IContainer';

export class PopoverContainer implements IContainer {
  readonly name = 'popover' as const;
  private host: HTMLElement | null = null;

  constructor(private shadowRoot: ShadowRoot) {}

  open(panelUrl: string): void {
    if (this.host) return;

    const host = document.createElement('div');
    host.className = 'container-popover';
    host.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      height: 100vh;
      z-index: 999999;
      background: #1e1e2e;
      box-shadow: -4px 0 24px rgba(0,0,0,0.3);
      pointer-events: auto;
    `;

    const iframe = document.createElement('iframe');
    iframe.src = panelUrl;
    iframe.style.cssText = 'width:100%; height:100%; border:none;';
    host.appendChild(iframe);

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
}
