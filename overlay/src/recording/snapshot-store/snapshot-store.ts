import type { RecordingSnapshot, SnapshotMeta } from '../../../../shared/types';
import { DomDiffer } from '../dom-differ';

const DB_NAME = 'vybit-recording';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;
const MAX_SNAPSHOTS = 100;

/**
 * IndexedDB-backed rolling buffer of recording snapshots.
 * Stores up to MAX_SNAPSHOTS, pruning oldest on insert.
 * Handles keyframe promotion when a keyframe is pruned.
 */
export class SnapshotStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** Add a snapshot to the store. Prunes oldest if over capacity. */
  async addSnapshot(snapshot: RecordingSnapshot): Promise<number> {
    const db = this.getDb();
    const id = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(snapshot);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });

    await this.pruneIfNeeded();
    return id;
  }

  /** Get a single snapshot by ID. */
  async getSnapshot(id: number): Promise<RecordingSnapshot | undefined> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as RecordingSnapshot | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  /** Get all snapshots, ordered by ID (insertion order). */
  async getAllSnapshots(): Promise<RecordingSnapshot[]> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as RecordingSnapshot[]);
      req.onerror = () => reject(req.error);
    });
  }

  /** Get lightweight metadata for all snapshots (for timeline display). */
  async getSnapshotMetas(): Promise<SnapshotMeta[]> {
    const snapshots = await this.getAllSnapshots();
    return snapshots.map(s => ({
      id: s.id!,
      timestamp: s.timestamp,
      trigger: s.trigger,
      isKeyframe: s.isKeyframe,
      thumbnail: s.thumbnail,
      elementInfo: s.elementInfo,
      consoleErrorCount: s.consoleLogs.filter(l => l.level === 'error').length,
      networkErrorCount: s.networkErrors.length,
      url: s.url,
    }));
  }

  /**
   * Get a range of snapshots by ID (inclusive).
   * Reconstructs full DOM for non-keyframe snapshots.
   */
  async getRange(startId: number, endId: number): Promise<RecordingSnapshot[]> {
    const all = await this.getAllSnapshots();
    const rangeSnapshots = all.filter(s => s.id! >= startId && s.id! <= endId);
    return this.reconstructDoms(rangeSnapshots, all);
  }

  /** Total number of snapshots stored. */
  async count(): Promise<number> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Clear all snapshots. */
  async clear(): Promise<void> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Prune oldest snapshots if over capacity.
   * When pruning a keyframe, promotes the next diff snapshot to keyframe.
   */
  private async pruneIfNeeded(): Promise<void> {
    const db = this.getDb();
    const total = await this.count();
    if (total <= MAX_SNAPSHOTS) return;

    const toPrune = total - MAX_SNAPSHOTS;
    const all = await this.getAllSnapshots();
    const removals = all.slice(0, toPrune);

    // Check if we're removing any keyframes that subsequent diffs depend on
    const remaining = all.slice(toPrune);
    if (remaining.length > 0 && !remaining[0].isKeyframe) {
      // Need to reconstruct full DOM for the first remaining snapshot
      const reconstructed = this.reconstructSingleDom(remaining[0], all);
      remaining[0] = {
        ...remaining[0],
        isKeyframe: true,
        domSnapshot: reconstructed,
        domDiff: undefined,
      };

      // Write the promoted snapshot back
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(remaining[0]);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // Delete pruned snapshots
    for (const snapshot of removals) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(snapshot.id!);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  /**
   * Reconstruct full DOM for a given snapshot by walking back to nearest keyframe.
   */
  private reconstructSingleDom(target: RecordingSnapshot, all: RecordingSnapshot[]): string {
    if (target.isKeyframe && target.domSnapshot) return target.domSnapshot;

    // Walk backward to find nearest keyframe
    const targetIdx = all.findIndex(s => s.id === target.id);
    let keyframeIdx = -1;
    for (let i = targetIdx; i >= 0; i--) {
      if (all[i].isKeyframe && all[i].domSnapshot) {
        keyframeIdx = i;
        break;
      }
    }

    if (keyframeIdx < 0) {
      throw new Error(`No keyframe found for snapshot ${target.id}`);
    }

    const baseDom = all[keyframeIdx].domSnapshot!;
    const diffs: string[] = [];
    for (let i = keyframeIdx + 1; i <= targetIdx; i++) {
      if (all[i].domDiff) diffs.push(all[i].domDiff!);
    }

    return DomDiffer.reconstructDom(baseDom, diffs);
  }

  /**
   * Reconstruct full DOM for each snapshot in a range.
   */
  private reconstructDoms(range: RecordingSnapshot[], all: RecordingSnapshot[]): RecordingSnapshot[] {
    return range.map(s => {
      if (s.isKeyframe && s.domSnapshot) return s;
      try {
        const fullDom = this.reconstructSingleDom(s, all);
        return { ...s, domSnapshot: fullDom };
      } catch {
        return s;
      }
    });
  }

  private getDb(): IDBDatabase {
    if (!this.db) throw new Error('SnapshotStore not opened. Call open() first.');
    return this.db;
  }
}
