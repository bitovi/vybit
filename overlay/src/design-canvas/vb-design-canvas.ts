import {
  css,
  DESIGN_CANVAS,
  DESIGN_CANVAS_IFRAME,
  CANVAS_RESIZE_HANDLE,
  CANVAS_RESIZE_BAR,
  CANVAS_CORNER_HANDLE,
  CANVAS_CORNER_DECO,
} from '../styles';

/**
 * <vb-design-canvas> — resizable design canvas with an embedded iframe.
 *
 * Attributes:
 *   src       — iframe URL
 *   width     — initial CSS width  (default: '100%')
 *   height    — initial CSS height (default: '400px')
 *   min-height — minimum height     (default: '200px')
 *
 * Events:
 *   vb-canvas-ready — fired when the iframe loads (detail: { iframe })
 *
 * The element can also be given arbitrary inline styles (e.g. margins)
 * by the caller after creation.
 */
export class VbDesignCanvas extends HTMLElement {
  static observedAttributes = ['src', 'width', 'height', 'min-height'];

  private wrapper: HTMLDivElement;
  private iframe: HTMLIFrameElement;

  // Resize state
  private _startY = 0;
  private _startHeight = 0;
  private _cornerStartX = 0;
  private _cornerStartY = 0;
  private _cornerStartW = 0;
  private _cornerStartH = 0;

  // Bound handlers (for removeEventListener)
  private _onResizeMove = (e: MouseEvent) => {
    const delta = e.clientY - this._startY;
    this.wrapper.style.height = `${Math.max(150, this._startHeight + delta)}px`;
  };
  private _onResizeUp = () => {
    this.iframe.style.pointerEvents = '';
    document.removeEventListener('mousemove', this._onResizeMove);
    document.removeEventListener('mouseup', this._onResizeUp);
    document.documentElement.style.cursor = '';
  };
  private _onCornerMove = (e: MouseEvent) => {
    const dw = e.clientX - this._cornerStartX;
    const dh = e.clientY - this._cornerStartY;
    this.wrapper.style.width = `${Math.max(200, this._cornerStartW + dw)}px`;
    this.wrapper.style.height = `${Math.max(150, this._cornerStartH + dh)}px`;
  };
  private _onCornerUp = () => {
    this.iframe.style.pointerEvents = '';
    document.removeEventListener('mousemove', this._onCornerMove);
    document.removeEventListener('mouseup', this._onCornerUp);
    document.documentElement.style.cursor = '';
  };

  constructor() {
    super();

    // Wrapper — the visible canvas outline
    this.wrapper = document.createElement('div');
    this.wrapper.setAttribute('data-tw-design-canvas', 'true');
    this.wrapper.style.cssText = css(DESIGN_CANVAS);
    this.wrapper.style.width = '100%';
    this.wrapper.style.height = '400px';
    this.wrapper.style.minHeight = '200px';

    // Iframe
    this.iframe = document.createElement('iframe');
    this.iframe.allow = 'microphone';
    this.iframe.style.cssText = css(DESIGN_CANVAS_IFRAME);
    this.iframe.addEventListener('load', () => {
      this.dispatchEvent(new CustomEvent('vb-canvas-ready', {
        bubbles: true,
        detail: { iframe: this.iframe },
      }));
    });
    this.wrapper.appendChild(this.iframe);

    // Bottom resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = css(CANVAS_RESIZE_HANDLE);
    const resizeBar = document.createElement('div');
    resizeBar.style.cssText = css(CANVAS_RESIZE_BAR);
    resizeHandle.appendChild(resizeBar);
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.iframe.style.pointerEvents = 'none';
      this._startY = e.clientY;
      this._startHeight = this.wrapper.offsetHeight;
      document.documentElement.style.cursor = 'ns-resize';
      document.addEventListener('mousemove', this._onResizeMove);
      document.addEventListener('mouseup', this._onResizeUp);
    });
    this.wrapper.appendChild(resizeHandle);

    // Corner resize handle (both axes)
    const cornerHandle = document.createElement('div');
    cornerHandle.style.cssText = css(CANVAS_CORNER_HANDLE);
    const cornerDeco = document.createElement('div');
    cornerDeco.style.cssText = css(CANVAS_CORNER_DECO);
    cornerHandle.appendChild(cornerDeco);
    cornerHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.iframe.style.pointerEvents = 'none';
      this._cornerStartX = e.clientX;
      this._cornerStartY = e.clientY;
      this._cornerStartW = this.wrapper.offsetWidth;
      this._cornerStartH = this.wrapper.offsetHeight;
      document.documentElement.style.cursor = 'nwse-resize';
      document.addEventListener('mousemove', this._onCornerMove);
      document.addEventListener('mouseup', this._onCornerUp);
    });
    this.wrapper.appendChild(cornerHandle);

  }

  connectedCallback(): void {
    if (!this.wrapper.parentNode) {
      this.style.display = 'contents';
      this.appendChild(this.wrapper);
    }
    this.syncAttributes();
  }

  attributeChangedCallback(): void {
    this.syncAttributes();
  }

  /** Sync observed attributes to internal DOM. */
  private syncAttributes(): void {
    const src = this.getAttribute('src');
    if (src && this.iframe.src !== src) {
      this.iframe.src = src;
    }

    const w = this.getAttribute('width');
    if (w) this.wrapper.style.width = w;

    const h = this.getAttribute('height');
    if (h) this.wrapper.style.height = h;

    const mh = this.getAttribute('min-height');
    if (mh) this.wrapper.style.minHeight = mh;
  }

  /** Get the inner iframe element (for posting messages, etc). */
  getIframe(): HTMLIFrameElement {
    return this.iframe;
  }

  /** Get the wrapper div (for reading offsetWidth/Height, setting additional styles). */
  getWrapper(): HTMLDivElement {
    return this.wrapper;
  }

  /** Clean up document-level event listeners on removal. */
  disconnectedCallback(): void {
    document.removeEventListener('mousemove', this._onResizeMove);
    document.removeEventListener('mouseup', this._onResizeUp);
    document.removeEventListener('mousemove', this._onCornerMove);
    document.removeEventListener('mouseup', this._onCornerUp);
  }
}
