import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NavigationInfo } from '../../../../shared/types';
import { createNavigationInterceptor } from './navigation-interceptor';

// Stubs for window + history
const popstateListeners: Array<(e: any) => void> = [];
const beforeUnloadListeners: Array<(e: any) => void> = [];
let mockHref = 'http://localhost:5173/';

// Mock history object for Node
const mockHistory: any = {
  pushState(_data: any, _unused: string, url?: string | URL | null) {
    if (url) mockHref = new URL(url.toString(), mockHref).href;
  },
  replaceState(_data: any, _unused: string, url?: string | URL | null) {
    if (url) mockHref = new URL(url.toString(), mockHref).href;
  },
};

beforeEach(() => {
  (globalThis as any).window = globalThis;
  (globalThis as any).history = mockHistory;

  // Reset pushState/replaceState to original mock behavior before each test
  mockHistory.pushState = function (_data: any, _unused: string, url?: string | URL | null) {
    if (url) mockHref = new URL(url.toString(), mockHref).href;
  };
  mockHistory.replaceState = function (_data: any, _unused: string, url?: string | URL | null) {
    if (url) mockHref = new URL(url.toString(), mockHref).href;
  };

  // Mock location
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      get href() { return mockHref; },
      set href(val: string) { mockHref = val; },
    },
  });
  mockHref = 'http://localhost:5173/';

  (globalThis as any).addEventListener = (type: string, fn: any) => {
    if (type === 'popstate') popstateListeners.push(fn);
    if (type === 'beforeunload') beforeUnloadListeners.push(fn);
  };
  (globalThis as any).removeEventListener = (type: string, fn: any) => {
    const list = type === 'popstate' ? popstateListeners : beforeUnloadListeners;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  };
});

afterEach(() => {
  popstateListeners.length = 0;
  beforeUnloadListeners.length = 0;
  // Restore base mock history
  mockHistory.pushState = function (_data: any, _unused: string, url?: string | URL | null) {
    if (url) mockHref = new URL(url.toString(), mockHref).href;
  };
  mockHistory.replaceState = function (_data: any, _unused: string, url?: string | URL | null) {
    if (url) mockHref = new URL(url.toString(), mockHref).href;
  };
});

describe('createNavigationInterceptor', () => {
  it('captures pushState navigations', () => {
    const events: NavigationInfo[] = [];
    const teardown = createNavigationInterceptor(info => events.push(info));

    history.pushState({}, '', '/about');

    expect(events).toHaveLength(1);
    expect(events[0].from).toBe('http://localhost:5173/');
    expect(events[0].to).toBe('http://localhost:5173/about');
    expect(events[0].method).toBe('pushState');

    teardown();
  });

  it('captures replaceState navigations', () => {
    const events: NavigationInfo[] = [];
    const teardown = createNavigationInterceptor(info => events.push(info));

    history.replaceState({}, '', '/replaced');

    expect(events).toHaveLength(1);
    expect(events[0].method).toBe('replaceState');
    expect(events[0].to).toBe('http://localhost:5173/replaced');

    teardown();
  });

  it('captures popstate event', () => {
    const events: NavigationInfo[] = [];
    const teardown = createNavigationInterceptor(info => events.push(info));

    // Simulate browser back: change href, then fire popstate
    mockHref = 'http://localhost:5173/previous';
    popstateListeners.forEach(fn => fn(new Event('popstate')));

    expect(events).toHaveLength(1);
    expect(events[0].method).toBe('popstate');
    expect(events[0].to).toBe('http://localhost:5173/previous');

    teardown();
  });

  it('captures beforeunload as full-page navigation', () => {
    const events: NavigationInfo[] = [];
    const teardown = createNavigationInterceptor(info => events.push(info));

    beforeUnloadListeners.forEach(fn => fn(new Event('beforeunload')));

    expect(events).toHaveLength(1);
    expect(events[0].method).toBe('full-page');
    expect(events[0].to).toBeNull();
    expect(events[0].from).toBe('http://localhost:5173/');

    teardown();
  });

  it('tracks URL changes across sequential pushState calls', () => {
    const events: NavigationInfo[] = [];
    const teardown = createNavigationInterceptor(info => events.push(info));

    history.pushState({}, '', '/page1');
    history.pushState({}, '', '/page2');

    expect(events).toHaveLength(2);
    expect(events[0].from).toBe('http://localhost:5173/');
    expect(events[0].to).toBe('http://localhost:5173/page1');
    expect(events[1].from).toBe('http://localhost:5173/page1');
    expect(events[1].to).toBe('http://localhost:5173/page2');

    teardown();
  });

  it('teardown stops capturing', () => {
    const events: NavigationInfo[] = [];
    const teardown = createNavigationInterceptor(info => events.push(info));
    teardown();

    history.pushState({}, '', '/after-teardown');
    expect(events).toHaveLength(0);
  });
});
