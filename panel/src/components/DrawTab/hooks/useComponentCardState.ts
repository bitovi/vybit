import type { ArgType, StoryEntry } from '../types';

// ── Phase ────────────────────────────────────────────────────────────────

export type CardPhase =
  | 'idle'        // not visible yet
  | 'cached'      // visible + cached ghost displayed, probing skipped
  | 'probing'     // probing stories for argTypes
  | 'probe-done'  // bestStory resolved, waiting for queue slot
  | 'loading'     // adaptive-iframe rendering story
  | 'ready'       // live ghost rendered OR cached ghost + live loaded
  | 'error';      // probe or iframe failed

// ── State ────────────────────────────────────────────────────────────────

export interface CardState {
  phase: CardPhase;
  bestStory: StoryEntry | null;
  argTypes: Record<string, ArgType>;
  defaultArgs: Record<string, unknown>;
  args: Record<string, unknown>;
  liveReady: boolean;
  storyBackground?: string;
  error: string | null;
  pendingArgs: Record<string, unknown> | null;
  /** True once the live adaptive-iframe has been triggered (even if still loading). */
  loadLiveRequested: boolean;
}

// ── Actions ──────────────────────────────────────────────────────────────

export type CardAction =
  | { type: 'BECOME_VISIBLE'; hasCachedGhost: boolean }
  | { type: 'PROBE_COMPLETE'; bestStory: StoryEntry; argTypes: Record<string, ArgType>; defaultArgs: Record<string, unknown> }
  | { type: 'PROBE_FALLBACK'; bestStory: StoryEntry }
  | { type: 'SLOT_ACQUIRED' }
  | { type: 'IFRAME_LOADED' }
  | { type: 'IFRAME_ERROR'; message: string }
  | { type: 'GHOST_EXTRACTED'; storyBackground?: string }
  | { type: 'ARGS_CHANGED'; args: Record<string, unknown> }
  | { type: 'REQUEST_LIVE_REFRESH' }
  | { type: 'CLEAR_PENDING_ARGS' };

// ── Initial state ────────────────────────────────────────────────────────

export const INITIAL_STATE: CardState = {
  phase: 'idle',
  bestStory: null,
  argTypes: {},
  defaultArgs: {},
  args: {},
  liveReady: false,
  storyBackground: undefined,
  error: null,
  pendingArgs: null,
  loadLiveRequested: false,
};

// ── Reducer ──────────────────────────────────────────────────────────────

export function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    // ── Visibility ─────────────────────────────────────────────────────
    case 'BECOME_VISIBLE': {
      if (state.phase !== 'idle') return state;
      return {
        ...state,
        phase: action.hasCachedGhost ? 'cached' : 'probing',
      };
    }

    // ── Probing ────────────────────────────────────────────────────────
    case 'PROBE_COMPLETE': {
      if (state.phase !== 'probing') return state;
      return {
        ...state,
        phase: 'probe-done',
        bestStory: action.bestStory,
        argTypes: action.argTypes,
        defaultArgs: action.defaultArgs,
        args: action.defaultArgs,
      };
    }
    case 'PROBE_FALLBACK': {
      if (state.phase !== 'probing') return state;
      return {
        ...state,
        phase: 'probe-done',
        bestStory: action.bestStory,
      };
    }

    // ── Queue / Loading ────────────────────────────────────────────────
    case 'SLOT_ACQUIRED': {
      if (state.phase !== 'probe-done') return state;
      return { ...state, phase: 'loading' };
    }
    case 'IFRAME_LOADED': {
      if (state.phase !== 'loading') return state;
      return { ...state, phase: 'ready', liveReady: true };
    }
    case 'IFRAME_ERROR': {
      if (state.phase !== 'loading') return state;
      return { ...state, phase: 'error', error: action.message };
    }

    // ── Ghost ──────────────────────────────────────────────────────────
    case 'GHOST_EXTRACTED': {
      if (state.phase !== 'ready' && state.phase !== 'loading') return state;
      return {
        ...state,
        storyBackground: action.storyBackground ?? state.storyBackground,
      };
    }

    // ── Args ───────────────────────────────────────────────────────────
    case 'ARGS_CHANGED': {
      if (state.liveReady) {
        // Iframe is ready — args can be applied immediately
        return { ...state, args: action.args };
      }
      // Iframe not ready — queue the args
      return { ...state, args: action.args, pendingArgs: action.args };
    }
    case 'CLEAR_PENDING_ARGS': {
      return { ...state, pendingArgs: null };
    }

    // ── Live refresh ───────────────────────────────────────────────────
    case 'REQUEST_LIVE_REFRESH': {
      if (state.phase === 'cached') {
        return { ...state, phase: 'probing', loadLiveRequested: true };
      }
      if (state.phase === 'error') {
        return { ...state, phase: 'probing', error: null, loadLiveRequested: true };
      }
      // Already past probing — just mark so the iframe queue entry enables
      return { ...state, loadLiveRequested: true };
    }
  }

  return state;
}
