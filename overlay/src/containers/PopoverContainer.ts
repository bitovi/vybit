import type { IContainer } from './IContainer';
import { css, CONTAINER_HOST, PANEL_SHADOW, IFRAME_FILL } from '../styles';

export class PopoverContainer implements IContainer {
  readonly name = 'popover' as const;
  private host: HTMLElement | null = null;

  constructor(private shadowRoot: ShadowRoot) {}

  open(panelUrl: string): void {
    if (this.host) return;

    const host = document.createElement('div');
    host.className = 'container-popover';
    host.style.cssText = css({
      ...CONTAINER_HOST,
      ...PANEL_SHADOW,
      top: '0',
      right: '0',
      width: '400px',
      height: '100vh',
    });

    const iframe = document.createElement('iframe');
    iframe.src = panelUrl;
    iframe.allow = 'microphone';
    iframe.style.cssText = css(IFRAME_FILL);
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
