import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePatchManager } from './usePatchManager';

// Mock the ws module
vi.mock('../ws', () => ({
  sendTo: vi.fn(),
  send: vi.fn(),
}));

import { sendTo, send } from '../ws';

// Stub crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
});

describe('usePatchManager', () => {
  it('starts with empty patches and zero counts', () => {
    const { result } = renderHook(() => usePatchManager());
    expect(result.current.patches).toEqual([]);
    expect(result.current.counts).toEqual({ draft: 0, committed: 0, implementing: 0, implemented: 0, partial: 0, error: 0 });
  });

  describe('preview / revertPreview', () => {
    it('sends PATCH_PREVIEW to overlay', () => {
      const { result } = renderHook(() => usePatchManager());
      act(() => result.current.preview('py-2', 'py-4'));
      expect(sendTo).toHaveBeenCalledWith('overlay', { type: 'PATCH_PREVIEW', oldClass: 'py-2', newClass: 'py-4' });
    });

    it('sends PATCH_REVERT to overlay', () => {
      const { result } = renderHook(() => usePatchManager());
      act(() => result.current.revertPreview());
      expect(sendTo).toHaveBeenCalledWith('overlay', { type: 'PATCH_REVERT' });
    });
  });

  describe('stage', () => {
    it('adds a staged patch and sends PATCH_STAGE to overlay', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));

      expect(result.current.patches).toHaveLength(1);
      expect(result.current.patches[0]).toMatchObject({
        id: 'uuid-1',
        elementKey: 'Card::div/0',
        status: 'staged',
        originalClass: 'py-2',
        newClass: 'py-4',
        property: 'py-',
      });
      expect(result.current.counts.draft).toBe(1);

      expect(sendTo).toHaveBeenCalledWith('overlay', {
        type: 'PATCH_STAGE',
        id: 'uuid-1',
        oldClass: 'py-2',
        newClass: 'py-4',
        property: 'py-',
      });
    });

    it('deduplicates by (elementKey, property) — replaces existing', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-6'));

      expect(result.current.patches).toHaveLength(1);
      expect(result.current.patches[0].newClass).toBe('py-6');
      expect(result.current.patches[0].id).toBe('uuid-2'); // new UUID
      expect(result.current.counts.draft).toBe(1);
    });

    it('self-removes when newClass === originalClass', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      expect(result.current.patches).toHaveLength(1);

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-2'));
      expect(result.current.patches).toHaveLength(0);
      expect(result.current.counts.draft).toBe(0);
      expect(sendTo).toHaveBeenLastCalledWith('overlay', { type: 'PATCH_REVERT' });
    });

    it('allows multiple patches for different properties', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      act(() => result.current.stage('Card::div/0', 'px-', 'px-2', 'px-6'));

      expect(result.current.patches).toHaveLength(2);
      expect(result.current.counts.draft).toBe(2);
    });
  });

  describe('commitAll', () => {
    it('sends PATCH_COMMIT with all staged IDs and clears local patches', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      act(() => result.current.stage('Card::div/0', 'px-', 'px-2', 'px-6'));

      act(() => result.current.commitAll());

      expect(send).toHaveBeenCalledWith({ type: 'PATCH_COMMIT', ids: ['uuid-1', 'uuid-2'] });
      // After commit, local patches are cleared (they now live on the server)
      expect(result.current.patches).toHaveLength(0);
      expect(result.current.counts.draft).toBe(0);
    });

    it('does nothing when no staged patches exist', () => {
      const { result } = renderHook(() => usePatchManager());
      act(() => result.current.commitAll());
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    it('removes a single patch by id and reverts preview', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      act(() => result.current.stage('Card::div/0', 'px-', 'px-2', 'px-6'));

      act(() => result.current.discard('uuid-1'));

      expect(result.current.patches).toHaveLength(1);
      expect(result.current.patches[0].id).toBe('uuid-2');
      expect(send).toHaveBeenCalledWith({ type: 'DISCARD_DRAFTS', ids: ['uuid-1'] });
      expect(sendTo).toHaveBeenLastCalledWith('overlay', { type: 'PATCH_REVERT' });
    });
  });

  describe('discardAll', () => {
    it('clears all patches, sends discard to server, and reverts preview', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      act(() => result.current.stage('Card::div/0', 'px-', 'px-2', 'px-6'));
      vi.clearAllMocks();

      act(() => result.current.discardAll());

      expect(result.current.patches).toHaveLength(0);
      expect(result.current.counts.draft).toBe(0);
      expect(send).toHaveBeenCalledWith({ type: 'DISCARD_DRAFTS', ids: expect.arrayContaining(['uuid-2']) });
      expect(sendTo).toHaveBeenLastCalledWith('overlay', { type: 'PATCH_REVERT' });
    });
  });

  describe('reset', () => {
    it('preserves patches (only resets local UI state)', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      vi.clearAllMocks();

      act(() => result.current.reset());

      // Patches persist across element switches
      expect(result.current.patches).toHaveLength(1);
      expect(sendTo).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('handleQueueUpdate', () => {
    it('updates server-side counts', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.handleQueueUpdate({
        draftCount: 0, committedCount: 3, implementingCount: 1, implementedCount: 5, partialCount: 0, errorCount: 0,
        draft: [], commits: [],
      }));

      expect(result.current.counts).toEqual({ draft: 0, committed: 3, implementing: 1, implemented: 5, partial: 0, error: 0 });
    });

    it('merges local draft count with server counts', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stage('Card::div/0', 'py-', 'py-2', 'py-4'));
      act(() => result.current.handleQueueUpdate({
        draftCount: 0, committedCount: 2, implementingCount: 0, implementedCount: 1, partialCount: 0, errorCount: 0,
        draft: [], commits: [],
      }));

      expect(result.current.counts).toEqual({ draft: 1, committed: 2, implementing: 0, implemented: 1, partial: 0, error: 0 });
    });

    it('stores queue state with commits', () => {
      const { result } = renderHook(() => usePatchManager());

      const committedPatch = {
        id: 'server-1', kind: 'class-change' as const, elementKey: 'Card::div/0', status: 'committed' as const,
        originalClass: 'py-2', newClass: 'py-4', property: 'py-', timestamp: '2026-01-01T00:00:00Z',
      };
      act(() => result.current.handleQueueUpdate({
        draftCount: 0, committedCount: 1, implementingCount: 0, implementedCount: 0, partialCount: 0, errorCount: 0,
        draft: [],
        commits: [{ id: 'commit-1', status: 'committed', timestamp: '2026-01-01T00:00:00Z', patches: [committedPatch] }],
      }));

      expect(result.current.queueState.commits).toHaveLength(1);
      expect(result.current.queueState.commits[0].patches[0].id).toBe('server-1');
    });
  });

  describe('stageMessage', () => {
    it('adds a message patch and sends MESSAGE_STAGE to server', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stageMessage('Make it bold', 'Card'));

      expect(result.current.patches).toHaveLength(1);
      expect(result.current.patches[0]).toMatchObject({
        id: 'uuid-1',
        kind: 'message',
        elementKey: 'Card',
        status: 'staged',
        message: 'Make it bold',
      });

      expect(send).toHaveBeenCalledWith({
        type: 'MESSAGE_STAGE',
        id: 'uuid-1',
        message: 'Make it bold',
        elementKey: 'Card',
      });
    });

    it('appends multiple messages without dedup', () => {
      const { result } = renderHook(() => usePatchManager());

      act(() => result.current.stageMessage('First', 'Card'));
      act(() => result.current.stageMessage('Second', 'Card'));

      expect(result.current.patches).toHaveLength(2);
    });
  });
});
