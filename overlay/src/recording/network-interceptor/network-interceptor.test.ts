import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createNetworkInterceptor } from './network-interceptor';
import type { NetworkInterceptorHandle } from './network-interceptor';

// Provide a minimal window.fetch stub
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  (globalThis as any).window = globalThis;
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('createNetworkInterceptor', () => {
  let handle: NetworkInterceptorHandle;

  beforeEach(() => {
    handle = createNetworkInterceptor({ serverOrigin: 'http://localhost:3333' });
  });

  afterEach(() => {
    handle.teardown();
  });

  it('captures non-ok responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await fetch('https://api.example.com/data');
    const errors = handle.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].url).toBe('https://api.example.com/data');
    expect(errors[0].method).toBe('GET');
    expect(errors[0].status).toBe(500);
    expect(errors[0].statusText).toBe('Internal Server Error');
    expect(errors[0].timestamp).toBeTruthy();
  });

  it('does not capture ok responses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await fetch('https://api.example.com/data');
    expect(handle.size()).toBe(0);
  });

  it('captures thrown fetch errors', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(fetch('https://api.example.com/data')).rejects.toThrow('Failed to fetch');
    const errors = handle.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].errorMessage).toBe('Failed to fetch');
    expect(errors[0].url).toBe('https://api.example.com/data');
  });

  it('re-throws errors after capturing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(fetch('https://api.example.com')).rejects.toThrow('network down');
  });

  it('filters out VyBit server requests', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });

    await fetch('http://localhost:3333/api/something');
    expect(handle.size()).toBe(0);
  });

  it('respects the method from init', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

    await fetch('https://api.example.com/items/1', { method: 'DELETE' });
    const errors = handle.flush();

    expect(errors[0].method).toBe('DELETE');
  });

  it('handles Request objects', async () => {
    const request = new Request('https://api.example.com/test', { method: 'POST' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, statusText: 'Unprocessable Entity' });

    await fetch(request);
    const errors = handle.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].url).toBe('https://api.example.com/test');
  });

  it('handles URL objects', async () => {
    const url = new URL('https://api.example.com/url-obj');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' });

    await fetch(url);
    const errors = handle.flush();

    expect(errors[0].url).toBe('https://api.example.com/url-obj');
  });

  it('caps buffer at 100 entries', async () => {
    for (let i = 0; i < 110; i++) {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });
      await fetch(`https://api.example.com/item/${i}`);
    }
    expect(handle.size()).toBe(100);
    const errors = handle.flush();
    expect(errors[0].url).toBe('https://api.example.com/item/10');
  });

  it('flush clears the buffer', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });
    await fetch('https://api.example.com/a');

    expect(handle.flush()).toHaveLength(1);
    expect(handle.flush()).toHaveLength(0);
  });

  it('peek does not clear the buffer', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });
    await fetch('https://api.example.com/a');

    expect(handle.peek()).toHaveLength(1);
    expect(handle.peek()).toHaveLength(1);
  });

  it('teardown restores original fetch', async () => {
    handle.teardown();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });
    await fetch('https://api.example.com/a');

    expect(handle.size()).toBe(0);
  });
});
