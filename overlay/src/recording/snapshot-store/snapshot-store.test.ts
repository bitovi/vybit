import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { SnapshotStore } from './snapshot-store';
import type { RecordingSnapshot } from '../../../../shared/types';

function makeSnapshot(overrides: Partial<RecordingSnapshot> = {}): RecordingSnapshot {
  return {
    timestamp: new Date().toISOString(),
    trigger: 'mutation',
    isKeyframe: false,
    consoleLogs: [],
    networkErrors: [],
    url: 'http://localhost:5173/',
    scrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 1024, height: 768 },
    ...overrides,
  };
}

describe('SnapshotStore', () => {
  let store: SnapshotStore;

  beforeEach(async () => {
    store = new SnapshotStore();
    await store.open();
    await store.clear();
  });

  afterEach(async () => {
    await store.close();
  });

  it('adds and retrieves a snapshot', async () => {
    const snapshot = makeSnapshot({ trigger: 'click', isKeyframe: true, domSnapshot: '<html></html>' });
    const id = await store.addSnapshot(snapshot);

    expect(id).toBeGreaterThan(0);
    const retrieved = await store.getSnapshot(id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.trigger).toBe('click');
    expect(retrieved!.domSnapshot).toBe('<html></html>');
  });

  it('returns undefined for non-existent ID', async () => {
    const result = await store.getSnapshot(9999);
    expect(result).toBeUndefined();
  });

  it('getAllSnapshots returns all in order', async () => {
    await store.addSnapshot(makeSnapshot({ trigger: 'page-load', isKeyframe: true, domSnapshot: '<html>1</html>' }));
    await store.addSnapshot(makeSnapshot({ trigger: 'mutation' }));
    await store.addSnapshot(makeSnapshot({ trigger: 'click' }));

    const all = await store.getAllSnapshots();
    expect(all).toHaveLength(3);
    expect(all[0].trigger).toBe('page-load');
    expect(all[2].trigger).toBe('click');
  });

  it('count returns correct number', async () => {
    expect(await store.count()).toBe(0);
    await store.addSnapshot(makeSnapshot({ isKeyframe: true, domSnapshot: '<html></html>' }));
    expect(await store.count()).toBe(1);
  });

  it('clear removes all snapshots', async () => {
    await store.addSnapshot(makeSnapshot({ isKeyframe: true, domSnapshot: '<html></html>' }));
    await store.addSnapshot(makeSnapshot({ isKeyframe: true, domSnapshot: '<html></html>' }));
    await store.clear();
    expect(await store.count()).toBe(0);
  });

  it('getSnapshotMetas returns lightweight meta objects', async () => {
    await store.addSnapshot(makeSnapshot({
      trigger: 'error',
      isKeyframe: true,
      domSnapshot: '<html></html>',
      consoleLogs: [
        { level: 'error', args: ['bad'], timestamp: 'now' },
        { level: 'log', args: ['ok'], timestamp: 'now' },
      ],
      networkErrors: [
        { url: '/api', method: 'GET', status: 500, timestamp: 'now' },
      ],
    }));

    const metas = await store.getSnapshotMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].trigger).toBe('error');
    expect(metas[0].consoleErrorCount).toBe(1);
    expect(metas[0].networkErrorCount).toBe(1);
    expect(metas[0]).not.toHaveProperty('domSnapshot');
    expect(metas[0]).not.toHaveProperty('consoleLogs');
  });

  describe('pruning', () => {
    it('prunes oldest snapshots beyond 100', async () => {
      // Add 102 keyframe snapshots
      for (let i = 0; i < 102; i++) {
        await store.addSnapshot(makeSnapshot({
          isKeyframe: true,
          domSnapshot: `<html>${i}</html>`,
          trigger: 'mutation',
        }));
      }

      const count = await store.count();
      expect(count).toBe(100);
    });

    it('promotes first remaining diff to keyframe when pruning removes its keyframe', async () => {
      // Keyframe at position 1
      await store.addSnapshot(makeSnapshot({
        isKeyframe: true,
        domSnapshot: '<html><body>base</body></html>',
        trigger: 'page-load',
      }));

      // Diff at position 2
      const { createPatch } = await import('diff');
      const diff = createPatch('dom', '<html><body>base</body></html>', '<html><body>changed</body></html>', '', '', { context: 3 });
      await store.addSnapshot(makeSnapshot({
        isKeyframe: false,
        domDiff: diff,
        trigger: 'mutation',
      }));

      // Fill remaining with keyframes to trigger pruning
      for (let i = 0; i < 100; i++) {
        await store.addSnapshot(makeSnapshot({
          isKeyframe: true,
          domSnapshot: `<html>${i}</html>`,
          trigger: 'mutation',
        }));
      }

      // After pruning, the diff should have been promoted to keyframe
      const all = await store.getAllSnapshots();
      const firstRemaining = all[0];
      expect(firstRemaining.isKeyframe).toBe(true);
      expect(firstRemaining.domSnapshot).toBeTruthy();
    });
  });

  describe('getRange', () => {
    it('returns snapshots in the given ID range', async () => {
      const id1 = await store.addSnapshot(makeSnapshot({ trigger: 'page-load', isKeyframe: true, domSnapshot: '<html>A</html>' }));
      const id2 = await store.addSnapshot(makeSnapshot({ trigger: 'click', isKeyframe: true, domSnapshot: '<html>B</html>' }));
      const id3 = await store.addSnapshot(makeSnapshot({ trigger: 'mutation', isKeyframe: true, domSnapshot: '<html>C</html>' }));

      const range = await store.getRange(id1, id2);
      expect(range).toHaveLength(2);
      expect(range[0].trigger).toBe('page-load');
      expect(range[1].trigger).toBe('click');
    });
  });
});
