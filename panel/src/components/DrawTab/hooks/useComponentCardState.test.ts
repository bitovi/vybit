import { describe, test, expect } from 'vitest';
import { cardReducer, INITIAL_STATE } from './useComponentCardState';
import type { CardState, CardAction } from './useComponentCardState';
import type { StoryEntry } from '../types';

const story: StoryEntry = {
  id: 'components-button--primary',
  title: 'Components/Button',
  name: 'Primary',
};

function dispatch(state: CardState, ...actions: CardAction[]): CardState {
  return actions.reduce((s, a) => cardReducer(s, a), state);
}

describe('cardReducer', () => {
  // ── IDLE ─────────────────────────────────────────────────────────────

  describe('IDLE phase', () => {
    test('BECOME_VISIBLE without cache → probing', () => {
      const next = cardReducer(INITIAL_STATE, { type: 'BECOME_VISIBLE', hasCachedGhost: false });
      expect(next.phase).toBe('probing');
    });

    test('BECOME_VISIBLE with cache → cached', () => {
      const next = cardReducer(INITIAL_STATE, { type: 'BECOME_VISIBLE', hasCachedGhost: true });
      expect(next.phase).toBe('cached');
    });

    test('ignores BECOME_VISIBLE if already past idle', () => {
      const probing: CardState = { ...INITIAL_STATE, phase: 'probing' };
      const next = cardReducer(probing, { type: 'BECOME_VISIBLE', hasCachedGhost: false });
      expect(next.phase).toBe('probing');
    });
  });

  // ── PROBING ──────────────────────────────────────────────────────────

  describe('PROBING phase', () => {
    const probing: CardState = { ...INITIAL_STATE, phase: 'probing' };

    test('PROBE_COMPLETE → probe-done with story + args', () => {
      const argTypes = { variant: { control: 'select', options: ['a', 'b'] } };
      const defaultArgs = { variant: 'a' };
      const next = cardReducer(probing, {
        type: 'PROBE_COMPLETE',
        bestStory: story,
        argTypes,
        defaultArgs,
      });
      expect(next.phase).toBe('probe-done');
      expect(next.bestStory).toBe(story);
      expect(next.argTypes).toBe(argTypes);
      expect(next.defaultArgs).toBe(defaultArgs);
      expect(next.args).toBe(defaultArgs);
    });

    test('PROBE_FALLBACK → probe-done with story, empty argTypes', () => {
      const next = cardReducer(probing, { type: 'PROBE_FALLBACK', bestStory: story });
      expect(next.phase).toBe('probe-done');
      expect(next.bestStory).toBe(story);
      expect(next.argTypes).toEqual({});
    });

    test('ignores PROBE_COMPLETE when not probing', () => {
      const ready: CardState = { ...INITIAL_STATE, phase: 'ready', liveReady: true };
      const next = cardReducer(ready, {
        type: 'PROBE_COMPLETE',
        bestStory: story,
        argTypes: {},
        defaultArgs: {},
      });
      expect(next.phase).toBe('ready');
      expect(next.bestStory).toBeNull();
    });
  });

  // ── PROBE-DONE → LOADING → READY ────────────────────────────────────

  describe('loading pipeline', () => {
    const probeDone: CardState = {
      ...INITIAL_STATE,
      phase: 'probe-done',
      bestStory: story,
    };

    test('SLOT_ACQUIRED → loading', () => {
      const next = cardReducer(probeDone, { type: 'SLOT_ACQUIRED' });
      expect(next.phase).toBe('loading');
    });

    test('IFRAME_LOADED → ready with liveReady', () => {
      const loading: CardState = { ...probeDone, phase: 'loading' };
      const next = cardReducer(loading, { type: 'IFRAME_LOADED' });
      expect(next.phase).toBe('ready');
      expect(next.liveReady).toBe(true);
    });

    test('IFRAME_ERROR → error', () => {
      const loading: CardState = { ...probeDone, phase: 'loading' };
      const next = cardReducer(loading, { type: 'IFRAME_ERROR', message: 'timeout' });
      expect(next.phase).toBe('error');
      expect(next.error).toBe('timeout');
    });

    test('ignores SLOT_ACQUIRED when not in probe-done', () => {
      const next = cardReducer(INITIAL_STATE, { type: 'SLOT_ACQUIRED' });
      expect(next.phase).toBe('idle');
    });

    test('ignores IFRAME_LOADED when not loading', () => {
      const next = cardReducer(probeDone, { type: 'IFRAME_LOADED' });
      expect(next.phase).toBe('probe-done');
    });
  });

  // ── CACHED ───────────────────────────────────────────────────────────

  describe('CACHED phase', () => {
    const cached: CardState = { ...INITIAL_STATE, phase: 'cached' };

    test('REQUEST_LIVE_REFRESH → probing with loadLiveRequested', () => {
      const next = cardReducer(cached, { type: 'REQUEST_LIVE_REFRESH' });
      expect(next.phase).toBe('probing');
      expect(next.loadLiveRequested).toBe(true);
    });
  });

  // ── ARGS ─────────────────────────────────────────────────────────────

  describe('args handling', () => {
    test('ARGS_CHANGED when liveReady — updates args, no pending', () => {
      const ready: CardState = { ...INITIAL_STATE, phase: 'ready', liveReady: true };
      const next = cardReducer(ready, { type: 'ARGS_CHANGED', args: { color: 'red' } });
      expect(next.args).toEqual({ color: 'red' });
      expect(next.pendingArgs).toBeNull();
    });

    test('ARGS_CHANGED when not liveReady — queues pending args', () => {
      const loading: CardState = { ...INITIAL_STATE, phase: 'loading' };
      const next = cardReducer(loading, { type: 'ARGS_CHANGED', args: { color: 'blue' } });
      expect(next.args).toEqual({ color: 'blue' });
      expect(next.pendingArgs).toEqual({ color: 'blue' });
    });

    test('CLEAR_PENDING_ARGS clears pending', () => {
      const withPending: CardState = { ...INITIAL_STATE, pendingArgs: { x: 1 } };
      const next = cardReducer(withPending, { type: 'CLEAR_PENDING_ARGS' });
      expect(next.pendingArgs).toBeNull();
    });
  });

  // ── GHOST_EXTRACTED ──────────────────────────────────────────────────

  describe('GHOST_EXTRACTED', () => {
    test('updates storyBackground in ready phase', () => {
      const ready: CardState = { ...INITIAL_STATE, phase: 'ready', liveReady: true };
      const next = cardReducer(ready, { type: 'GHOST_EXTRACTED', storyBackground: '#fff' });
      expect(next.storyBackground).toBe('#fff');
    });

    test('updates storyBackground in loading phase', () => {
      const loading: CardState = { ...INITIAL_STATE, phase: 'loading' };
      const next = cardReducer(loading, { type: 'GHOST_EXTRACTED', storyBackground: '#000' });
      expect(next.storyBackground).toBe('#000');
    });

    test('ignores in idle phase', () => {
      const next = cardReducer(INITIAL_STATE, { type: 'GHOST_EXTRACTED', storyBackground: '#f00' });
      expect(next.storyBackground).toBeUndefined();
    });
  });

  // ── ERROR recovery ───────────────────────────────────────────────────

  describe('ERROR phase', () => {
    const errState: CardState = { ...INITIAL_STATE, phase: 'error', error: 'boom' };

    test('REQUEST_LIVE_REFRESH → probing, clears error', () => {
      const next = cardReducer(errState, { type: 'REQUEST_LIVE_REFRESH' });
      expect(next.phase).toBe('probing');
      expect(next.error).toBeNull();
      expect(next.loadLiveRequested).toBe(true);
    });
  });

  // ── Full pipeline integration ────────────────────────────────────────

  describe('full pipeline', () => {
    test('idle → visible → probing → probe-done → loading → ready', () => {
      const argTypes = { variant: { control: 'select' } };
      const defaultArgs = { variant: 'a' };
      const state = dispatch(
        INITIAL_STATE,
        { type: 'BECOME_VISIBLE', hasCachedGhost: false },
        { type: 'PROBE_COMPLETE', bestStory: story, argTypes, defaultArgs },
        { type: 'SLOT_ACQUIRED' },
        { type: 'IFRAME_LOADED' },
      );
      expect(state.phase).toBe('ready');
      expect(state.liveReady).toBe(true);
      expect(state.bestStory).toBe(story);
      expect(state.args).toBe(defaultArgs);
    });

    test('cached → REQUEST_LIVE_REFRESH → probing → full pipeline', () => {
      const state = dispatch(
        INITIAL_STATE,
        { type: 'BECOME_VISIBLE', hasCachedGhost: true },
        { type: 'REQUEST_LIVE_REFRESH' },
        { type: 'PROBE_FALLBACK', bestStory: story },
        { type: 'SLOT_ACQUIRED' },
        { type: 'IFRAME_LOADED' },
      );
      expect(state.phase).toBe('ready');
      expect(state.liveReady).toBe(true);
      expect(state.loadLiveRequested).toBe(true);
    });

    test('args queued during loading are available after IFRAME_LOADED', () => {
      const state = dispatch(
        INITIAL_STATE,
        { type: 'BECOME_VISIBLE', hasCachedGhost: false },
        { type: 'PROBE_FALLBACK', bestStory: story },
        { type: 'SLOT_ACQUIRED' },
        { type: 'ARGS_CHANGED', args: { color: 'red' } },
      );
      expect(state.phase).toBe('loading');
      expect(state.pendingArgs).toEqual({ color: 'red' });

      const ready = cardReducer(state, { type: 'IFRAME_LOADED' });
      expect(ready.phase).toBe('ready');
      expect(ready.args).toEqual({ color: 'red' });
      // Note: pending args are still in state until CLEAR_PENDING_ARGS
    });
  });
});
