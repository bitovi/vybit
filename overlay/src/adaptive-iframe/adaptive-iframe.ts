import { extractStyles, applyStylesToHost, injectChildStyles, CHILD_STYLE_PROPERTIES } from './style-cloner';

/** Properties inlined on the root element when building component HTML for insertion. */
const COMPONENT_INLINE_PROPS: readonly string[] = CHILD_STYLE_PROPERTIES;

/** Recursively inline computed styles from a source tree onto a cloned tree. */
function injectChildStylesDeep(source: Element, clone: Element): void {
  const srcChildren = source.children;
  const clnChildren = clone.children;
  const len = Math.min(srcChildren.length, clnChildren.length);
  for (let i = 0; i < len; i++) {
    const srcChild = srcChildren[i];
    const clnChild = clnChildren[i] as HTMLElement;
    const computed = (srcChild.ownerDocument.defaultView ?? window).getComputedStyle(srcChild);
    if (clnChild.style) {
      for (const prop of COMPONENT_INLINE_PROPS) {
        clnChild.style.setProperty(prop, computed.getPropertyValue(prop));
      }
    }
    injectChildStylesDeep(srcChild, clnChild);
  }
}

export class AdaptiveIframe extends HTMLElement {
  static observedAttributes = ['src', 'srcdoc'];

  private shadow: ShadowRoot;
  private ghostEl: HTMLDivElement;
  private hiddenIframe: HTMLIFrameElement;
  private loadTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private hasLoaded = false;
  private _loadedDispatched = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });

    // Ghost content container — visible placeholder.
    // display:contents removes its box from the tree so the host element's
    // own display value (block, inline, inline-block) drives layout directly.
    this.ghostEl = document.createElement('div');
    this.ghostEl.setAttribute('part', 'ghost');
    this.ghostEl.style.display = 'contents';

    const style = document.createElement('style');
    style.textContent = `
      iframe {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        border: none;
        opacity: 0;
        transition: opacity 0.2s ease-in;
        pointer-events: none;
      }
      iframe.visible {
        opacity: 1;
        pointer-events: auto;
      }
    `;
    this.shadow.append(style, this.ghostEl);

    // Hidden iframe for style extraction — positioned at (0,0) and made
    // invisible via opacity:0 rather than visibility:hidden or a large negative
    // offset.  Browsers skip CSS custom-property resolution for
    // visibility:hidden iframes and for elements scrolled far off-screen, so
    // computed colors (e.g. --secondary) come back wrong.  opacity:0 keeps the
    // element fully rendered while remaining invisible to the user.
    this.hiddenIframe = document.createElement('iframe');
    Object.assign(this.hiddenIframe.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '800px',
      height: '600px',
      opacity: '0',
      pointerEvents: 'none',
      border: 'none',
      zIndex: '-999999',
    });
    this.hiddenIframe.addEventListener('load', () => this.onIframeLoad());
    this.hiddenIframe.addEventListener('error', () => this.reportError('Failed to load iframe'));
  }

  private observer: MutationObserver | null = null;

  connectedCallback() {
    document.body.appendChild(this.hiddenIframe);
    this.triggerLoad();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = null;
    this.hiddenIframe.remove();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.triggerLoad();
  }

  private triggerLoad() {
    // Clean up any previous observer
    this.observer?.disconnect();
    this.observer = null;

    // Clear any pending load timeout
    if (this.loadTimeoutId) clearTimeout(this.loadTimeoutId);
    this.hasLoaded = false;
    this._loadedDispatched = false;

    const src = this.getAttribute('src');
    const srcdoc = this.getAttribute('srcdoc');
    if (srcdoc != null) {
      this.hiddenIframe.srcdoc = srcdoc;
    } else if (src) {
      this.hiddenIframe.src = src;
    }

    // Set a timeout to detect if the iframe never loads (e.g., wrong URL, network error)
    this.loadTimeoutId = setTimeout(() => {
      if (!this.hasLoaded) {
        const src = this.getAttribute('src');
        this.reportError(`Story failed to load (${src || 'unknown'}) — check that Storybook is running on port 6006+`);
      }
    }, 20000);
  }

  private onIframeLoad() {
    // Clear the load timeout since the iframe loaded successfully
    if (this.loadTimeoutId) {
      clearTimeout(this.loadTimeoutId);
      this.loadTimeoutId = null;
    }
    this.hasLoaded = true;

    const doc = this.hiddenIframe.contentDocument;
    if (!doc) return;

    // Strip body/html margin and padding
    const resetStyle = doc.createElement('style');
    resetStyle.textContent =
      'body,html{margin:0!important;padding:0!important}';
    doc.head.appendChild(resetStyle);

    // For srcdoc iframes, content is available immediately
    const srcdoc = this.getAttribute('srcdoc');
    if (srcdoc != null) {
      this.extractAndApply(doc);
      return;
    }

    // For Storybook src iframes, the story component renders asynchronously
    // after the page load event. Wait for a non-spinner child in #storybook-root.
    this.waitForStoryContent(doc);
  }

  /**
   * Sends an updateStoryArgs message to the Storybook iframe via the channel.
   * This avoids a full page reload and bypasses Storybook's URL args validation
   * (which rejects values containing special characters like periods).
   */
  updateArgs(storyId: string, updatedArgs: Record<string, unknown>) {
    const win = this.hiddenIframe.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({
        key: 'storybook-channel',
        event: {
          type: 'updateStoryArgs',
          args: [{ storyId, updatedArgs }],
        },
      }),
      '*',
    );
  }

  /**
   * Waits for the actual story content to appear in #storybook-root.
   * Storybook initially shows a loading spinner; we need the real component.
   * After the first extraction, the observer stays active to re-extract
   * when the story re-renders (e.g. after an updateArgs call).
   */
  private waitForStoryContent(doc: Document) {
    // Clean up any previous observer
    this.observer?.disconnect();

    let extracted = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const tryExtract = () => {
      const root = this.findStoryRoot(doc);
      if (root) {
        extracted = true;
        this.extractAndApply(doc);
        return true;
      }
      return false;
    };

    // Check if content is already there
    if (tryExtract()) {
      // Keep observing for future DOM mutations (args updates)
    }

    // Observe #storybook-root (or body as fallback) for child changes
    const target = doc.querySelector('#storybook-root') ?? doc.body;
    if (!target) return;

    const observer = new MutationObserver(() => {
      const root = this.findStoryRoot(doc);
      if (!extracted) {
        // Initial extraction — run immediately
        tryExtract();
      } else {
        // Subsequent mutations (e.g. args update) — wait for CSS transitions to finish
        // before extracting, so computed colors are fully resolved.
        if (debounceTimer) clearTimeout(debounceTimer);
        const transitionMs = root
          ? parseFloat((root.ownerDocument.defaultView ?? window).getComputedStyle(root).transitionDuration) * 1000
          : 0;
        const waitMs = Math.ceil(transitionMs) + 50;
        debounceTimer = setTimeout(() => tryExtract(), waitMs);
      }
    });
    this.observer = observer;
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    // Safety timeout: only disconnect the observer created in THIS call.
    // Guards against stories that never render (broken/missing).
    // After extraction the observer stays alive for args-update re-extraction.
    setTimeout(() => {
      if (!extracted && this.observer === observer) {
        this.observer.disconnect();
        this.observer = null;
        this.reportError('Story did not render — component may not exist or Storybook story file has an error');
      }
    }, 20000);
  }

  /**
   * Finds the story's root element, skipping Storybook's loading spinner.
   */
  private findStoryRoot(doc: Document): Element | null {
    const storybookRoot = doc.querySelector('#storybook-root');
    if (storybookRoot) {
      // Skip elements that are the Storybook loading spinner
      for (const child of storybookRoot.children) {
        if (!child.classList.contains('sb-loader')) {
          return child;
        }
      }
      return null;
    }
    // Fallback for non-Storybook content
    return doc.body.firstElementChild;
  }

  /**
   * Returns the full outerHTML of the story root element with inlined
   * computed styles on the root and all descendants — suitable for
   * insertion into a different document.
   */
  getComponentHtml(): string {
    const doc = this.hiddenIframe.contentDocument;
    if (!doc) return '';
    const root = this.findStoryRoot(doc);
    if (!root) return this.ghostEl.innerHTML;

    const clone = root.cloneNode(true) as HTMLElement;
    // Inline computed styles on the root clone itself
    const computed = getComputedStyle(root);
    for (const prop of COMPONENT_INLINE_PROPS) {
      clone.style.setProperty(prop, computed.getPropertyValue(prop));
    }
    // Inline on all descendant elements
    injectChildStylesDeep(root, clone);
    return clone.outerHTML;
  }

  private extractAndApply(doc: Document) {
    const root = this.findStoryRoot(doc);
    const win = root ? (root.ownerDocument.defaultView ?? window) : window;
    if (!root) return;

    // Sync hidden iframe width to the host element's actual width so that
    // block-level content auto-expands to the correct size.  Fall back to
    // 800 px if the host hasn't been laid out yet.
    const hostWidth = this.clientWidth || 800;
    this.hiddenIframe.style.width = hostWidth + 'px';

    // Extract computed styles and apply to host (drives layout flow)
    const styles = extractStyles(root);
    applyStylesToHost(this, styles, hostWidth);

    // Clone story content into the ghost — use innerHTML (not outerHTML)
    // because the host element already carries the root's styles (padding,
    // background, border, etc.).  outerHTML would duplicate them.
    this.ghostEl.innerHTML = root.innerHTML;

    // Inline computed styles on every cloned child for visual fidelity
    const rootChildren = root.children;
    const ghostChildren = this.ghostEl.children;
    const len = Math.min(rootChildren.length, ghostChildren.length);
    for (let i = 0; i < len; i++) {
      injectChildStyles(rootChildren[i], ghostChildren[i]);
    }

    // Signal first successful render so the load queue can free its slot.
    if (!this._loadedDispatched) {
      this._loadedDispatched = true;
      this.dispatchEvent(new CustomEvent('iframe-loaded'));
    }

    // Emit extracted ghost data for caching — fires on every extraction
    // (initial load AND arg-change re-renders) so the cache stays fresh.
    const ghostHtml = this.getComponentHtml();
    const storyBackground = getComputedStyle(doc.body).backgroundColor;
    this.dispatchEvent(new CustomEvent('ghost-extracted', {
      detail: { ghostHtml, hostStyles: styles, storyBackground },
    }));
  }

  private _error: string | null = null;

  /** Report an error that occurred during loading or rendering. */
  private reportError(message: string) {
    this._error = message;
    console.error(`[AdaptiveIframe] ${message}`);
    this.dispatchEvent(new CustomEvent('iframe-error', { detail: { message } }));
  }

  /** Get any error message from the last load attempt. */
  getError(): string | null {
    return this._error;
  }

  /** Clear the error state (e.g. when retrying). */
  clearError() {
    this._error = null;
  }
}
