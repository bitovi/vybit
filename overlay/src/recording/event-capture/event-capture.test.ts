import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEventCapture } from './event-capture';
import type { EventCaptureHandle } from './event-capture';

// Minimal DOM stubs for Node test environment
class MockMutationObserver {
  callback: MutationCallback;
  static instances: MockMutationObserver[] = [];

  constructor(callback: MutationCallback) {
    this.callback = callback;
    MockMutationObserver.instances.push(this);
  }

  observe() {}
  disconnect() {}
  takeRecords() { return []; }

  // Test helper: simulate mutations
  trigger(mutations: Partial<MutationRecord>[]) {
    this.callback(mutations as MutationRecord[], this as any);
  }
}

const clickListeners: Array<(e: any) => void> = [];
const errorListeners: Array<(e: any) => void> = [];
const rejectionListeners: Array<(e: any) => void> = [];

beforeEach(() => {
  MockMutationObserver.instances = [];
  (globalThis as any).MutationObserver = MockMutationObserver;
  (globalThis as any).window = globalThis;
  (globalThis as any).ShadowRoot = class {};

  // Mock document.body
  (globalThis as any).document = {
    body: { id: '', getRootNode: () => ({}) },
  };

  (globalThis as any).addEventListener = (type: string, fn: any, _opts?: any) => {
    if (type === 'click') clickListeners.push(fn);
    if (type === 'error') errorListeners.push(fn);
    if (type === 'unhandledrejection') rejectionListeners.push(fn);
  };
  (globalThis as any).removeEventListener = (type: string, fn: any, _opts?: any) => {
    const list =  type === 'click' ? clickListeners
                : type === 'error' ? errorListeners
                : rejectionListeners;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  };

  // Stub HTMLElement
  (globalThis as any).HTMLElement = class {};
});

afterEach(() => {
  clickListeners.length = 0;
  errorListeners.length = 0;
  rejectionListeners.length = 0;
});

describe('createEventCapture', () => {
  it('triggers mutation snapshot on MutationObserver callback (debounced)', async () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    const observer = MockMutationObserver.instances[0];
    observer.trigger([{ target: { tagName: 'DIV', id: '', parentElement: null, getRootNode: () => ({}) } } as any]);

    // Should not fire immediately (debounced)
    expect(onSnapshot).not.toHaveBeenCalled();

    // Wait for debounce (500ms)
    await new Promise(r => setTimeout(r, 600));

    expect(onSnapshot).toHaveBeenCalledWith('mutation');

    handle.teardown();
  });

  it('triggers click snapshot on click events', () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    const mockTarget = {
      tagName: 'BUTTON',
      className: 'btn primary',
      id: 'submit-btn',
      innerText: 'Submit',
      getRootNode: () => ({}),
    };

    clickListeners.forEach(fn => fn({ target: mockTarget }));

    expect(onSnapshot).toHaveBeenCalledWith('click', {
      tag: 'button',
      classes: 'btn primary',
      id: 'submit-btn',
      innerText: 'Submit',
    });

    handle.teardown();
  });

  it('triggers error snapshot on window error', () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    errorListeners.forEach(fn => fn(new Event('error')));
    expect(onSnapshot).toHaveBeenCalledWith('error');

    handle.teardown();
  });

  it('triggers error snapshot on unhandled rejection', () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    rejectionListeners.forEach(fn => fn(new Event('unhandledrejection')));
    expect(onSnapshot).toHaveBeenCalledWith('error');

    handle.teardown();
  });

  it('skips mutations from VyBit shadow host', async () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    const observer = MockMutationObserver.instances[0];
    observer.trigger([{
      target: { tagName: 'DIV', id: 'tw-visual-editor-host', parentElement: null, getRootNode: () => ({}) },
    } as any]);

    await new Promise(r => setTimeout(r, 600));
    expect(onSnapshot).not.toHaveBeenCalled();

    handle.teardown();
  });

  it('skips click events inside VyBit shadow DOM', () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    clickListeners.forEach(fn => fn({
      target: {
        tagName: 'BUTTON',
        className: '',
        id: 'tw-visual-editor-host',
        innerText: '',
        getRootNode: () => ({}),
      },
    }));

    expect(onSnapshot).not.toHaveBeenCalled();

    handle.teardown();
  });

  it('suppressNext prevents one mutation callback', async () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    handle.suppressNext();
    const observer = MockMutationObserver.instances[0];
    observer.trigger([{ target: { tagName: 'DIV', id: '', parentElement: null, getRootNode: () => ({}) } } as any]);

    await new Promise(r => setTimeout(r, 600));
    expect(onSnapshot).not.toHaveBeenCalled();

    // Next mutation should fire normally
    observer.trigger([{ target: { tagName: 'DIV', id: '', parentElement: null, getRootNode: () => ({}) } } as any]);
    await new Promise(r => setTimeout(r, 600));
    expect(onSnapshot).toHaveBeenCalledWith('mutation');

    handle.teardown();
  });

  it('teardown stops all capturing', async () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);
    handle.teardown();

    // Click listeners should be removed
    expect(clickListeners).toHaveLength(0);
    expect(errorListeners).toHaveLength(0);
    expect(rejectionListeners).toHaveLength(0);
  });

  it('debounces rapid mutations', async () => {
    const onSnapshot = vi.fn();
    const handle = createEventCapture(onSnapshot);

    const observer = MockMutationObserver.instances[0];

    // Fire 5 rapid mutations
    for (let i = 0; i < 5; i++) {
      observer.trigger([{ target: { tagName: 'DIV', id: '', parentElement: null, getRootNode: () => ({}) } } as any]);
    }

    await new Promise(r => setTimeout(r, 600));
    // Should only fire once
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith('mutation');

    handle.teardown();
  });
});
