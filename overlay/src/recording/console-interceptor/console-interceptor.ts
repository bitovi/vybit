import type { ConsoleEntry } from '../../../../shared/types';

const MAX_BUFFER_SIZE = 200;
const MAX_ARG_LENGTH = 500;
const MAX_SERIALIZE_DEPTH = 3;

export interface ConsoleInterceptorHandle {
  /** Flush and return all buffered entries, clearing the buffer. */
  flush(): ConsoleEntry[];
  /** Peek at current buffer without flushing. */
  peek(): readonly ConsoleEntry[];
  /** Number of entries currently buffered. */
  size(): number;
  /** Stop intercepting and restore originals. */
  teardown(): void;
}

/**
 * Start intercepting console.log/warn/error/info and window error events.
 * Returns a handle with flush/peek/teardown.
 *
 * Usage:
 *   const console = createConsoleInterceptor();
 *   // ... later ...
 *   const entries = console.flush();
 *   console.teardown();
 */
export function createConsoleInterceptor(): ConsoleInterceptorHandle {
  let buffer: ConsoleEntry[] = [];
  const originals: Record<string, (...args: unknown[]) => void> = {};

  function push(entry: ConsoleEntry): void {
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  // Patch console methods
  const levels = ['log', 'warn', 'error', 'info'] as const;
  for (const level of levels) {
    originals[level] = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push({ level, args: args.map(a => safeSerialize(a)), timestamp: new Date().toISOString() });
      originals[level](...args);
    };
  }

  // Error listeners
  const errorHandler = (event: ErrorEvent) => {
    push({
      level: 'error',
      args: [event.message || 'Unknown error'],
      timestamp: new Date().toISOString(),
      stack: event.error?.stack,
    });
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    push({
      level: 'error',
      args: [reason instanceof Error ? reason.message : safeSerialize(reason)],
      timestamp: new Date().toISOString(),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return {
    flush(): ConsoleEntry[] {
      const entries = buffer;
      buffer = [];
      return entries;
    },
    peek(): readonly ConsoleEntry[] {
      return buffer;
    },
    size(): number {
      return buffer.length;
    },
    teardown(): void {
      for (const [level, fn] of Object.entries(originals)) {
        (console as any)[level] = fn;
      }
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    },
  };
}

/** Safely serialize a value to a string with depth and length limits. */
export function safeSerialize(value: unknown, depth = MAX_SERIALIZE_DEPTH): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return truncate(`${value.name}: ${value.message}`);

  if (depth <= 0) return '[…]';

  const seen = new WeakSet();
  return truncate(stringifyWithDepth(value, depth, seen));
}

function stringifyWithDepth(value: unknown, depth: number, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object' && typeof value !== 'function') return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
  }

  if (depth <= 0) return Array.isArray(value) ? '[…]' : '{…}';

  if (Array.isArray(value)) {
    const items = value.map(v => stringifyWithDepth(v, depth - 1, seen));
    return `[${items.join(', ')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, 20)
    .map(([k, v]) => `${k}: ${stringifyWithDepth(v, depth - 1, seen)}`);
  return `{${entries.join(', ')}}`;
}

function truncate(s: string): string {
  return s.length > MAX_ARG_LENGTH ? s.slice(0, MAX_ARG_LENGTH) + '…' : s;
}
