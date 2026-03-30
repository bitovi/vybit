import type { NetworkError } from '../../../../shared/types';

const MAX_BUFFER_SIZE = 100;

export interface NetworkInterceptorHandle {
  /** Flush and return all buffered errors, clearing the buffer. */
  flush(): NetworkError[];
  /** Peek at current buffer without flushing. */
  peek(): readonly NetworkError[];
  /** Number of entries currently buffered. */
  size(): number;
  /** Stop intercepting and restore original fetch. */
  teardown(): void;
}

/**
 * Start intercepting fetch() to capture non-ok responses and thrown errors.
 * Filters out requests to VyBit's own server origin.
 *
 * Usage:
 *   const network = createNetworkInterceptor({ serverOrigin: 'http://localhost:3333' });
 *   // ... later ...
 *   const errors = network.flush();
 *   network.teardown();
 */
export function createNetworkInterceptor(options: { serverOrigin?: string } = {}): NetworkInterceptorHandle {
  const serverOrigin = options.serverOrigin ?? '';
  let buffer: NetworkError[] = [];
  const originalFetch = window.fetch.bind(window);

  function push(entry: NetworkError): void {
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  window.fetch = async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = extractUrl(input);
    const method = init?.method ?? 'GET';

    if (serverOrigin && url.startsWith(serverOrigin)) {
      return originalFetch(input, init);
    }

    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        push({
          url,
          method: method.toUpperCase(),
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        });
      }
      return response;
    } catch (err) {
      push({
        url,
        method: method.toUpperCase(),
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  };

  return {
    flush(): NetworkError[] {
      const entries = buffer;
      buffer = [];
      return entries;
    },
    peek(): readonly NetworkError[] {
      return buffer;
    },
    size(): number {
      return buffer.length;
    },
    teardown(): void {
      window.fetch = originalFetch;
    },
  };
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}
