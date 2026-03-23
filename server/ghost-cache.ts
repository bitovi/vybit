import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface GhostCacheEntry {
  storyId: string;
  argsHash: string;
  ghostHtml: string;
  hostStyles: Record<string, string>;
  storyBackground?: string;
  componentName: string;
  componentPath?: string;
  extractedAt: number;
}

interface CacheFile {
  entries: GhostCacheEntry[];
}

const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB

const cache = new Map<string, GhostCacheEntry>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cacheDir: string | null = null;
let cacheFilePath: string | null = null;

function getCacheDir(): string {
  if (!cacheDir) {
    cacheDir = path.join(process.cwd(), "node_modules", ".cache", "vybit");
  }
  return cacheDir;
}

function getCacheFilePath(): string {
  if (!cacheFilePath) {
    cacheFilePath = path.join(getCacheDir(), "ghost-cache.json");
  }
  return cacheFilePath;
}

export function computeArgsHash(args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";
  const sorted = JSON.stringify(args, Object.keys(args).sort());
  return crypto.createHash("sha1").update(sorted).digest("hex").slice(0, 12);
}

function cacheKey(storyId: string, argsHash: string): string {
  return argsHash ? `${storyId}::${argsHash}` : storyId;
}

/** Load the cache from disk into memory. Safe to call multiple times. */
export function loadCache(): void {
  cache.clear();
  const filePath = getCacheFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data: CacheFile = JSON.parse(raw);
    if (Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        cache.set(cacheKey(entry.storyId, entry.argsHash), entry);
      }
    }
  } catch {
    // File doesn't exist or is corrupt — start fresh
  }
}

/** Write the cache to disk. Creates the directory if needed. */
function flushToDisk(): void {
  const filePath = getCacheFilePath();
  const dir = getCacheDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const data: CacheFile = { entries: Array.from(cache.values()) };
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
  } catch (err) {
    console.error("[ghost-cache] Failed to write cache:", err);
  }
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDisk();
  }, 500);
}

/** Evict oldest entries until we're under the size and count limits. */
function evictIfNeeded(): void {
  // Evict by count
  while (cache.size > MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.extractedAt < oldestTime) {
        oldestTime = entry.extractedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
    else break;
  }

  // Evict by total size
  let totalBytes = () => {
    let sum = 0;
    for (const entry of cache.values()) sum += entry.ghostHtml.length;
    return sum;
  };
  while (totalBytes() > MAX_TOTAL_BYTES && cache.size > 0) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.extractedAt < oldestTime) {
        oldestTime = entry.extractedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
    else break;
  }
}

export function getCachedGhost(storyId: string, argsHash: string): GhostCacheEntry | null {
  return cache.get(cacheKey(storyId, argsHash)) ?? null;
}

export function setCachedGhost(entry: Omit<GhostCacheEntry, "argsHash" | "extractedAt"> & { args?: Record<string, unknown> }): void {
  const argsHash = computeArgsHash(entry.args);
  const full: GhostCacheEntry = {
    storyId: entry.storyId,
    argsHash,
    ghostHtml: entry.ghostHtml,
    hostStyles: entry.hostStyles,
    storyBackground: entry.storyBackground,
    componentName: entry.componentName,
    componentPath: entry.componentPath,
    extractedAt: Date.now(),
  };
  cache.set(cacheKey(full.storyId, argsHash), full);
  evictIfNeeded();
  scheduleFlush();
}

export function getAllCachedGhosts(): GhostCacheEntry[] {
  return Array.from(cache.values());
}

export function invalidateAll(): void {
  cache.clear();
  scheduleFlush();
}
