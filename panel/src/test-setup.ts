import '@testing-library/jest-dom';

// jsdom doesn't implement ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// jsdom doesn't implement IntersectionObserver — mock it so that all elements
// are immediately considered "visible" (intersecting), which keeps tests simple.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      // Fire immediately with isIntersecting: true so lazy loads trigger in tests
      this._callback = callback;
    }
    private _callback: IntersectionObserverCallback;
    observe(target: Element) {
      this._callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
  } as unknown as typeof globalThis.IntersectionObserver;
}
