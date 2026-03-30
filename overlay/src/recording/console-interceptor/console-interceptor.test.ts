import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConsoleInterceptor, safeSerialize } from './console-interceptor';
import type { ConsoleInterceptorHandle } from './console-interceptor';

// Minimal window stubs for Node test environment
const errorListeners: Array<(e: any) => void> = [];
const rejectionListeners: Array<(e: any) => void> = [];
const origAddEvent = globalThis.addEventListener?.bind(globalThis);
const origRemoveEvent = globalThis.removeEventListener?.bind(globalThis);

beforeEach(() => {
  (globalThis as any).window = globalThis;
  (globalThis as any).addEventListener = (type: string, fn: any) => {
    if (type === 'error') errorListeners.push(fn);
    if (type === 'unhandledrejection') rejectionListeners.push(fn);
  };
  (globalThis as any).removeEventListener = (type: string, fn: any) => {
    const list = type === 'error' ? errorListeners : rejectionListeners;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  };
});

afterEach(() => {
  errorListeners.length = 0;
  rejectionListeners.length = 0;
  if (origAddEvent) (globalThis as any).addEventListener = origAddEvent;
  if (origRemoveEvent) (globalThis as any).removeEventListener = origRemoveEvent;
});

describe('createConsoleInterceptor', () => {
  let handle: ConsoleInterceptorHandle;
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;
  let origInfo: typeof console.info;

  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    origInfo = console.info;
    handle = createConsoleInterceptor();
  });

  afterEach(() => {
    handle.teardown();
    // Ensure originals are truly restored
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    console.info = origInfo;
  });

  it('captures console.log calls', () => {
    console.log('hello', 42);
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('log');
    expect(entries[0].args).toEqual(['hello', '42']);
    expect(entries[0].timestamp).toBeTruthy();
  });

  it('captures console.warn calls', () => {
    console.warn('watch out');
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('warn');
  });

  it('captures console.error calls', () => {
    console.error('bad');
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('error');
  });

  it('captures console.info calls', () => {
    console.info('fyi');
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('info');
  });

  it('still calls the original console method', () => {
    console.log('original-check');
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].args[0]).toBe('original-check');
  });

  it('flush clears the buffer', () => {
    console.log('a');
    console.log('b');
    expect(handle.flush()).toHaveLength(2);
    expect(handle.flush()).toHaveLength(0);
  });

  it('peek returns current buffer without clearing', () => {
    console.log('a');
    expect(handle.peek()).toHaveLength(1);
    expect(handle.peek()).toHaveLength(1);
  });

  it('size reflects buffer length', () => {
    expect(handle.size()).toBe(0);
    console.log('a');
    expect(handle.size()).toBe(1);
  });

  it('caps buffer at 200 entries', () => {
    for (let i = 0; i < 210; i++) {
      console.log(`msg-${i}`);
    }
    expect(handle.size()).toBe(200);
    const entries = handle.flush();
    expect(entries[0].args[0]).toBe('msg-10');
  });

  it('captures window error events', () => {
    const event = { message: 'ReferenceError: x is not defined', error: new Error('x is not defined') } as ErrorEvent;
    errorListeners.forEach(fn => fn(event));
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('error');
    expect(entries[0].args[0]).toBe('ReferenceError: x is not defined');
    expect(entries[0].stack).toBeTruthy();
  });

  it('captures unhandled promise rejections', () => {
    const error = new Error('promise failed');
    const event = { reason: error } as PromiseRejectionEvent;
    rejectionListeners.forEach(fn => fn(event));
    const entries = handle.flush();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('error');
    expect(entries[0].args[0]).toBe('promise failed');
    expect(entries[0].stack).toBeTruthy();
  });

  it('captures non-Error rejection reasons', () => {
    const event = { reason: 'string rejection' } as PromiseRejectionEvent;
    rejectionListeners.forEach(fn => fn(event));
    const entries = handle.flush();
    expect(entries[0].args[0]).toBe('string rejection');
  });

  it('teardown restores console methods and stops capturing', () => {
    handle.teardown();
    console.log('after teardown');
    expect(handle.size()).toBe(0);
  });
});

describe('safeSerialize', () => {
  it('serializes primitives', () => {
    expect(safeSerialize(null)).toBe('null');
    expect(safeSerialize(undefined)).toBe('undefined');
    expect(safeSerialize(42)).toBe('42');
    expect(safeSerialize(true)).toBe('true');
    expect(safeSerialize('hello')).toBe('hello');
  });

  it('serializes Error objects', () => {
    const result = safeSerialize(new TypeError('oops'));
    expect(result).toBe('TypeError: oops');
  });

  it('serializes plain objects', () => {
    const result = safeSerialize({ a: 1, b: 'x' });
    expect(result).toBe('{a: 1, b: x}');
  });

  it('serializes arrays', () => {
    const result = safeSerialize([1, 'two', 3]);
    expect(result).toBe('[1, two, 3]');
  });

  it('handles circular references', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const result = safeSerialize(obj);
    expect(result).toContain('[Circular]');
  });

  it('truncates long strings', () => {
    const long = 'x'.repeat(600);
    const result = safeSerialize(long);
    expect(result.length).toBeLessThanOrEqual(501); // 500 + '…'
  });

  it('limits depth', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    const result = safeSerialize(deep, 2);
    expect(result).toContain('{…}');
  });
});
