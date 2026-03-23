# 026 — Refactor ComponentGroupItem with Explicit State Machine

**Status:** Proposed  
**Date:** 2026-03-23  
**Author:** Architecture Review  
**Priority:** Medium (improves maintainability, enables future features)

---

## Executive Summary

`ComponentGroupItem` (~250 lines, 6 useEffects, 8 state/ref variables) manages a **7-phase component discovery, loading, and arming lifecycle**, but all state transitions are **implicit, spread across effects, and refs**. This makes it brittle to modify and hard to reason about.

**Proposed fix:** Introduce an explicit `useReducer`-based state machine (`useComponentCardState`) that models the 7 phases and their transitions, then extract rendering concerns into smaller subcomponents. The state machine will make every transition testable and reversible, dramatically reducing complexity.

---

## Current Architecture & Behavior

### 7-Phase Lifecycle

Every ComponentGroupItem card flows through these phases (currently encoded implicitly):

```
┌─────┐     ┌─────────┐     ┌──────────┐     ┌────────┐     ┌─────────┐     ┌───────┐     ┌───────┐
│ IDLE│────▶│ VISIBLE │────▶│ PROBING  │────▶│ QUEUED │────▶│ LOADING │────▶│ READY │────▶│ ARMED │
└─────┘     └─────────┘     └──────────┘     └────────┘     └─────────┘     └───────┘     └───────┘
                  │              │                 │              │              │
                  │              │                 │              │              │ cache shortcut
                  │              │                 │              │              │
                  └──────────────────────────────────────────────────────────────┘
                     (if cachedGhostHtml exists, skip to READY or pseudo-cached state)
```

#### Phase Details

| Phase | Entry | Exit | State | Key variables |
|-------|-------|------|-------|---|
| **IDLE** | Component mount | IntersectionObserver fires | Not visible | `isVisible=false` |
| **VISIBLE** | Intersection detected | `bestStory` resolved or cache confirms | Visible, ready to probe | `isVisible=true` |
| **PROBING** | `probeEnabled` derived from visibility + cache state | `bestStory` + `argTypes` determined | Hidden probe iframe running | `probing`, `bestStory`, `argTypes`, `defaultArgs` (from `useStoryProbe`) |
| **QUEUED** | `useIframeSlot` requested | Slot granted by queue | Waiting for slot in global iframe queue | `canLoad=false` |
| **LOADING** | `canLoad=true` → iframe.src assigned | `iframe-loaded` or `iframe-error` event | Adaptive-iframe rendering story + extracting styles | `ghostRef`, `liveReady=false`, event listeners active |
| **READY** | `iframe-loaded` event OR cached ghost displayed | User clicks card | Ghost visible, can be armed or edited | `liveReady=true` OR `cachedGhostHtml` displayed |
| **ARMED** | User clicks card (arm button click) | `COMPONENT_DISARMED` received from overlay | Waiting for user to place component | `isArmed=true` (from DrawTab) |

All phases need explicit cleanup on unmount or transition.

### Cache Shortcut (Primary Source of Confusion)

When `cachedGhostHtml` is provided by DrawTab:

1. **VISIBLE** phase immediately renders cached ghost via `dangerouslySetInnerHTML` (pseudo-READY)
2. Probing & loading are **optionally skipped** UNLESS:
   - User clicks gear icon (`showProps=true`) → `loadLive` flag → re-enter PROBING
   - User clicks arm button → `loadLive` flag → re-enter PROBING to fetch fresh ghost with current args
3. Meanwhile, a `pendingArgsRef` queues any arg changes until the live iframe is ready
4. Probe iframe is created even for cached components if conditions are met

**The problem:** This dual-path (cached vs. live) is not modeled as a state transition; instead, it's a hidden fork in the conditionals. Adding new behaviors (e.g., "retry after error on arm", "show stale cache while loading new") becomes fragile.

### 10 Cross-Cutting Concerns

| Concern | Location in code | State variables involved | Trigger/cleanup |
|---------|------------------|--------------------------|-----------------|
| **Visibility detection** | `useEffect #1` | `isVisible`, `cardRef` | IntersectionObserver on mount |
| **Story probing** | `useStoryProbe` hook | `probing`, `bestStory`, `argTypes`, `defaultArgs` | Controlled by `probeEnabled` derived expr |
| **Default args sync** | `useEffect #3` | `args` state | When `defaultArgs` changes |
| **Iframe queue slot** | `useIframeSlot` hook | `canLoad`, `releaseSlot` | When predicate becomes true |
| **Iframe src assignment** | `useEffect #6` | `initialLoadDone` ref, `canLoad`, `bestStory` | Once slot acquired + story resolved |
| **Iframe event wiring** | `useEffect #4` | `liveReady`, `error`, `pendingArgsRef`, `ghostRef` | On each `bestStory` change, cleanup on unmount |
| **Ghost extraction** | `useEffect #5` | `storyBackground`, `onGhostExtracted` callback | On `ghost-extracted` event |
| **Args updates** | `handleArgsChange` callback | `args`, `liveReady`, `pendingArgsRef`, `loadLive` | User interaction in ArgsForm |
| **Arm/disarm** | `handleArmClick` callback | `isArmed` (from DrawTab), `onArm/onDisarm` props | User click or DrawTab message |
| **Cache shortcut** | Conditional render paths | `cachedGhostHtml`, `loadLive`, `probeEnabled` formula | Complex boolean logic |

All concerns are interleaved in a single 250-line component with 8 state/ref variables and 6 useEffects. **Result:** Difficult to modify without breaking other concerns.

---

## Problems This Solves

### 1. Implicit State Transitions

**Current:** Whether we're in PROBING, LOADING, or READY is inferred from 4+ boolean flags:
```ts
const probeEnabled = isVisible && (!cachedGhostHtml || showProps || loadLive);
const { canLoad, releaseSlot } = useIframeSlot(isVisible && !!bestStory && !probing && (!cachedGhostHtml || loadLive));
if (!probing && bestStory && canLoad && initialLoadDone.current) {
  // transition to LOADING?
}
if (liveReady) {
  // we're in READY?
}
```

**Result:** Hard to add logging, impossible to unit test state transitions, unclear which transitions are valid.

### 2. Scattered Event Handling

**Current:** Events (`iframe-loaded`, `iframe-error`, `ghost-extracted`) are handled in separate useEffects with complex dependencies. Adding new transitions (e.g., "retry on error") requires editing multiple places.

### 3. Cache vs. Live Dual Path

**Current:** The `loadLive` flag + `pendingArgsRef` + conditional `probeEnabled` create a hidden state fork. Behaviors like "show cache while loading fresh" or "invalidate cache on error" are ad-hoc and easy to regress.

### 4. Race Conditions

**Current:** `pendingArgsRef` works, but it's a side-effect-based workaround. The state machine will model it explicitly (e.g., `LOADING_WITH_PENDING_ARGS` queues before proceeding).

### 5. Hard to Test

**Current:** Testing ComponentGroupItem requires mocking Storybook, adaptive-iframe, the queue, etc. The reducer can be tested in isolation as a pure function.

### 6. Difficult to Debug

**Current:** Breakpointing through 6 useEffects to understand why a card is stuck in PROBING is slow. A state machine with explicit transitions is easier to trace and log.

---

## Proposed Solution

### 1. Create `useComponentCardState` Hook

**File:** `panel/src/components/DrawTab/hooks/useComponentCardState.ts`

Define a **pure reducer** that models the state machine:

```typescript
// Explicit state type — covers all phases
type CardPhase = 
  | 'idle'           // not visible yet
  | 'cached'         // visible + cached ghost displayed, live probing optional
  | 'probing'        // probing stories for argTypes
  | 'probe-done'     // bestStory resolved, waiting for queue slot
  | 'queued'         // requested slot from useIframeSlot
  | 'loading'        // adaptive-iframe rendering story
  | 'ready'          // live ghost rendered OR cached ghost displayed
  | 'error'          // error in probing or loading
  | 'armed';         // armed for placement

// State shape — single source of truth
interface CardState {
  phase: CardPhase;
  bestStory: StoryEntry | null;
  argTypes: Record<string, ArgType>;
  defaultArgs: Record<string, unknown>;
  args: Record<string, unknown>;
  liveReady: boolean;           // iframe fully loaded
  storyBackground?: string;
  error: string | null;
  pendingArgs: Record<string, unknown> | null;  // queued args waiting for iframe
}

// Discriminated union of all possible transitions
type CardAction =
  | { type: 'BECOME_VISIBLE' }
  | { type: 'CACHE_HIT'; cached: CachedEntry }
  | { type: 'PROBE_START' }
  | { type: 'PROBE_COMPLETE'; bestStory: StoryEntry; argTypes: Record<string, ArgType>; defaultArgs: Record<string, unknown> }
  | { type: 'PROBE_FAILED' }
  | { type: 'SLOT_ACQUIRED' }
  | { type: 'SLOT_FAILED' }
  | { type: 'IFRAME_LOADED'; storyBackground?: string }
  | { type: 'IFRAME_ERROR'; message: string }
  | { type: 'GHOST_EXTRACTED'; storyBackground?: string }
  | { type: 'ARGS_CHANGED'; args: Record<string, unknown> }
  | { type: 'REQUEST_LIVE_REFRESH' }  // gear click or arm on cached component
  | { type: 'ARM' }
  | { type: 'DISARM' }
  | { type: 'RESET' };  // on unmount or disconnect

// Pure reducer
function cardReducer(state: CardState, action: CardAction): CardState {
  switch (state.phase) {
    case 'idle':
      if (action.type === 'BECOME_VISIBLE') {
        return { ...state, phase: 'cached' };  // or 'probing' if no cache
      }
      break;
    
    case 'cached':
      if (action.type === 'REQUEST_LIVE_REFRESH') {
        return { ...state, phase: 'probing' };
      }
      if (action.type === 'ARM') {
        return { ...state, phase: 'armed' };
      }
      break;
    
    case 'probing':
      if (action.type === 'PROBE_COMPLETE') {
        return {
          ...state,
          phase: 'probe-done',
          bestStory: action.bestStory,
          argTypes: action.argTypes,
          defaultArgs: action.defaultArgs,
          args: action.defaultArgs,
        };
      }
      if (action.type === 'PROBE_FAILED') {
        return { ...state, phase: 'error', error: 'Story probing failed' };
      }
      break;
    
    case 'probe-done':
      if (action.type === 'SLOT_ACQUIRED') {
        return { ...state, phase: 'queued' };
      }
      break;
    
    case 'queued':
      if (action.type === 'SLOT_ACQUIRED') {
        return { ...state, phase: 'loading' };
      }
      break;
    
    case 'loading':
      if (action.type === 'IFRAME_LOADED') {
        return {
          ...state,
          phase: 'ready',
          liveReady: true,
          storyBackground: action.storyBackground,
          pendingArgs: null,  // apply any queued args now
        };
      }
      if (action.type === 'IFRAME_ERROR') {
        return { ...state, phase: 'error', error: action.message };
      }
      if (action.type === 'ARGS_CHANGED' && !state.liveReady) {
        // Queue args until iframe ready
        return { ...state, pendingArgs: action.args };
      }
      break;
    
    case 'ready':
      if (action.type === 'ARGS_CHANGED') {
        return { ...state, args: action.args };
      }
      if (action.type === 'ARM') {
        return { ...state, phase: 'armed' };
      }
      break;
    
    case 'armed':
      if (action.type === 'DISARM') {
        return { ...state, phase: 'ready' };
      }
      break;
    
    case 'error':
      if (action.type === 'REQUEST_LIVE_REFRESH') {
        return { ...state, phase: 'probing', error: null };
      }
      break;
  }
  
  // Invalid transition — return unchanged
  return state;
}
```

**Hook wrapper** bridges external hook outputs into dispatches:

```typescript
interface UseComponentCardStateConfig {
  cachedGhostHtml?: string;
  stories: StoryEntry[];
  showProps: boolean;
  isArmed: boolean;
}

export function useComponentCardState(config: UseComponentCardStateConfig) {
  const [state, dispatch] = useReducer(cardReducer, initialState);
  const { bestStory: probeResult, probing, argTypes, defaultArgs } = useStoryProbe(...);
  const { canLoad, releaseSlot } = useIframeSlot(...);
  
  // Bridge: when probe completes, dispatch PROBE_COMPLETE
  useEffect(() => {
    if (!probing && probeResult) {
      dispatch({ type: 'PROBE_COMPLETE', bestStory: probeResult, argTypes, defaultArgs });
    }
  }, [probing, probeResult, argTypes, defaultArgs]);
  
  // Bridge: when slot acquired, dispatch SLOT_ACQUIRED
  useEffect(() => {
    if (canLoad) {
      dispatch({ type: 'SLOT_ACQUIRED' });
    }
  }, [canLoad]);
  
  // Bridge: user actions
  const arm = () => dispatch({ type: 'ARM' });
  const disarm = () => dispatch({ type: 'DISARM' });
  const changeArgs = (args) => dispatch({ type: 'ARGS_CHANGED', args });
  const requestLiveRefresh = () => dispatch({ type: 'REQUEST_LIVE_REFRESH' });
  
  return { state, arm, disarm, changeArgs, requestLiveRefresh, releaseSlot };
}
```

### 2. Extract Subcomponents

Split ComponentGroupItem into smaller, focused components:

#### `ComponentCardPreview` (~50 lines)

**File:** `panel/src/components/DrawTab/components/ComponentCardPreview/ComponentCardPreview.tsx`

Handles the 6 conditional render branches:

```typescript
interface ComponentCardPreviewProps {
  phase: CardPhase;
  error: string | null;
  cachedGhostHtml?: string;
  storyBackground?: string;
  bestStory: StoryEntry | null;
  ghostRef: React.Ref<any>;  // adaptive-iframe custom element
}

export function ComponentCardPreview({
  phase,
  error,
  cachedGhostHtml,
  storyBackground,
  bestStory,
  ghostRef,
}: ComponentCardPreviewProps) {
  return (
    <div className={`flex items-center justify-center min-h-14 overflow-hidden`}
      style={storyBackground ? { backgroundColor: storyBackground } : undefined}
    >
      {phase === 'idle' && <span className="text-[10px] text-bv-muted"> </span>}
      {error && <span className="text-[10px] text-bv-orange px-2 py-1">{error}</span>}
      {phase === 'probing' && <span className="text-[10px] text-bv-muted">Loading preview…</span>}
      {phase === 'cached' && cachedGhostHtml && (
        <div className="pointer-events-none" dangerouslySetInnerHTML={{ __html: cachedGhostHtml }} />
      )}
      {phase === 'loading' && !cachedGhostHtml && <span className="text-[10px] text-bv-muted">Loading…</span>}
      {phase !== 'idle' && phase !== 'error' && phase !== 'probing' && phase !== 'cached' && phase !== 'loading' && bestStory && (
        <adaptive-iframe ref={ghostRef} style={{ pointerEvents: 'none' }} />
      )}
    </div>
  );
}
```

#### `ComponentCardFooter` (~30 lines)

**File:** `panel/src/components/DrawTab/components/ComponentCardFooter/ComponentCardFooter.tsx`

```typescript
interface ComponentCardFooterProps {
  isArmed: boolean;
  group: ComponentGroup;
  hasArgs: boolean;
  showProps: boolean;
  onToggleProps: () => void;
  onStoryLink?: (e: React.MouseEvent) => void;
}

export function ComponentCardFooter({
  isArmed,
  group,
  hasArgs,
  showProps,
  onToggleProps,
  onStoryLink,
}: ComponentCardFooterProps) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-bv-border bg-bv-bg">
      {isArmed ? (
        <span className="text-[11px] font-medium text-bv-teal">Click the page to place</span>
      ) : (
        <a href={`/storybook/?path=/story/${group.stories[0]?.id}`} target="_blank" rel="noopener noreferrer" onClick={onStoryLink}>
          <ComponentTitle fullTitle={group.fullTitle} />
        </a>
      )}
      {hasArgs && (
        <button
          className={`w-5.5 h-5.5 rounded flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 ${
            showProps ? 'opacity-100 bg-bv-surface-hi text-bv-text' : 'text-bv-muted hover:bg-bv-surface-hi hover:text-bv-text'
          }`}
          title="Customize props"
          onClick={(e) => { e.stopPropagation(); onToggleProps(); }}
        >
          <svg>…</svg>
        </button>
      )}
    </div>
  );
}
```

#### Refactored `ComponentGroupItem` (~80 lines)

**File:** `panel/src/components/DrawTab/components/ComponentGroupItem/ComponentGroupItem.tsx`

```typescript
export function ComponentGroupItem({
  group,
  isArmed,
  onArm,
  onDisarm,
  cachedGhostHtml,
  cachedHostStyles,
  cachedStoryBackground,
  onGhostExtracted,
}: ComponentGroupItemProps) {
  const cardRef = useRef<HTMLLIElement>(null);
  const ghostRef = useRef<any>(null);
  const [showProps, setShowProps] = useState(false);
  const [storyBackground, setStoryBackground] = useState(cachedStoryBackground);
  const [args, setArgs] = useState<Record<string, unknown>>({});
  
  // Visibility detection
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) dispatch({ type: 'BECOME_VISIBLE' });
    }, { rootMargin: '200px' });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);
  
  // State machine
  const { state, arm, disarm, changeArgs, requestLiveRefresh, releaseSlot } = useComponentCardState({
    cachedGhostHtml,
    stories: group.stories,
    showProps,
    isArmed,
  });
  
  // Events from adaptive-iframe
  useEffect(() => {
    const el = ghostRef.current;
    if (!el) return;
    
    el.addEventListener('iframe-loaded', () => dispatch({ type: 'IFRAME_LOADED' }));
    el.addEventListener('iframe-error', (e) => dispatch({ type: 'IFRAME_ERROR', message: e.detail.message }));
    el.addEventListener('ghost-extracted', (e) => {
      const { ghostHtml, hostStyles, storyBackground } = e.detail;
      setStoryBackground(storyBackground);
      onGhostExtracted?.({ ... });
    });
    
    return () => {
      el.removeEventListener('iframe-loaded', ...);
      el.removeEventListener('iframe-error', ...);
      el.removeEventListener('ghost-extracted', ...);
    };
  }, [bestStory, group.name, group.componentPath, onGhostExtracted]);
  
  const handleArmClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isArmed) {
      disarm();
    } else {
      const ghostHtml = ghostRef.current?.getComponentHtml?.() ?? cachedGhostHtml ?? '';
      onArm(ghostHtml, args);
      arm();
    }
  }, [isArmed, onArm, onDisarm, args, cachedGhostHtml, bestStory, group.name, group.componentPath, onGhostExtracted]);
  
  return (
    <li ref={cardRef} className={`group rounded border overflow-hidden cursor-pointer transition-[border-color,box-shadow] ${
      isArmed ? 'border-bv-teal shadow-[0_0_0_2px_var(--color-bv-teal),0_0_12px_rgba(0,132,139,0.2)]' : 'border-bv-border hover:border-[#555]'
    }`} onClick={handleArmClick}>
      <ComponentCardPreview
        phase={state.phase}
        error={state.error}
        cachedGhostHtml={cachedGhostHtml}
        storyBackground={storyBackground}
        bestStory={state.bestStory}
        ghostRef={ghostRef}
      />
      
      <ComponentCardFooter
        isArmed={isArmed}
        group={group}
        hasArgs={/* check argTypes */}
        showProps={showProps}
        onToggleProps={() => setShowProps(prev => !prev)}
      />
      
      {showProps && <ArgsForm argTypes={state.argTypes} args={state.args} onArgsChange={changeArgs} />}
    </li>
  );
}
```

### 3. Benefits

| Benefit | How achieved |
|---------|-------------|
| **Explicit state** | Single `phase` field instead of 4+ booleans |
| **Testable transitions** | Pure reducer can be unit tested without DOM/mocks |
| **Single responsibility** | Each component has one concern (preview rendering, footer rendering, state machine) |
| **Easier to debug** | Console.log each dispatch, see phase transitions clearly |
| **Clearer cache path** | `CACHED` phase explicitly models the dual-path fork |
| **Easier to modify** | Adding new states/transitions requires only reducer changes + maybe subcomponent props |
| **Better error handling** | Explicit `error` field in state; transitions to ERROR phase cleanly |

---

## Implementation Steps

### **Step 1: Create `useComponentCardState` hook** (~150 lines)
- Create `panel/src/components/DrawTab/hooks/useComponentCardState.ts`
- Define `CardPhase`, `CardState`, `CardAction` types
- Implement `cardReducer` pure function with all transitions
- Wrap in `useComponentCardState` hook that bridges external hooks
- **Depends on:** Nothing (new file)
- **Tests:** Create `useComponentCardState.test.ts` in parallel

### **Step 2: Create `ComponentCardPreview` subcomponent** (~60 lines)
- Create `panel/src/components/DrawTab/components/ComponentCardPreview/` modlet
- Move preview render branches from ComponentGroupItem
- Receive `phase`, `error`, `bestStory`, `cachedGhostHtml`, `ghostRef` as props
- **Depends on:** Step 1 (needs `CardPhase` type)

### **Step 3: Create `ComponentCardFooter` subcomponent** (~40 lines)
- Create `panel/src/components/DrawTab/components/ComponentCardFooter/` modlet
- Move footer + gear button + ComponentTitle helper
- **Depends on:** Nothing (parallel with step 2)

### **Step 4: Refactor `ComponentGroupItem`** (~100 lines, down from 250)
- Replace 6 useEffects with `useComponentCardState` hook
- Replace 8 state/ref variables with `state` from hook
- Render `<ComponentCardPreview>` and `<ComponentCardFooter>`
- Keep all props unchanged (DrawTab needs no changes)
- **Depends on:** Steps 1, 2, 3

### **Step 5: Update DrawTab if needed** (likely no changes)
- Verify no changes needed to DrawTab.tsx prop passing
- If arrow-function prop changes, update as needed
- **Depends on:** Step 4

### **Step 6: Verify & test**
- `cd panel && npm test` — existing tests pass
- `cd panel && npm test -- useComponentCardState` — new reducer tests pass
- `npm run build` — no compile errors
- Manual verification in Draw tab

---

## Verification Checklist

- [ ] `npm test` passes all existing tests
- [ ] New `useComponentCardState.test.ts` passes all reducer transitions
- [ ] `npm run build` succeeds with no TS errors
- [ ] Manual: Open Draw tab → cached ghosts appear instantly for previously-loaded components
- [ ] Manual: Scroll new component into view → probe + load completes → ghost appears
- [ ] Manual: Click gear icon → props drawer opens → change arg value → live preview updates
- [ ] Manual: Click card while armed → cursor changes to crosshair → click target element → component inserted into DOM
- [ ] Manual: Component disarms after placement
- [ ] Manual: Error states display properly (e.g., story load timeout)
- [ ] No console errors or warnings

---

## Decisions & Rationale

### Decision 1: `useReducer` instead of XState

**Choice:** `useReducer` with discriminated union of actions

**Rationale:**
- Avoids new dependency; XState adds 50KB+ to bundle
- Discriminated unions provide same type safety + explicitness
- Team is more familiar with `useReducer` than state machines
- Complexity is low enough to not need hierarchical states or parallel states

**Trade-off:** No built-in debugging tools like XState, but can add logging to reducer easily

### Decision 2: Keep `useStoryProbe` and `useIframeSlot` as separate hooks

**Choice:** Don't absorb probe and queue logic into reducer

**Rationale:**
- Probe has sequential async logic (story loops, timeouts); reducer is sync-only
- Queue is a module-level singleton managing a global resource; doesn't fit in component state
- The reducer bridges their outputs, making dependencies clear
- Easier to test probe and queue independently

**Trade-off:** State machine is slightly smaller view of the full flow, but cleaner architecture

### Decision 3: No changes to DrawTab or prop interface

**Choice:** ComponentGroupItem prop interface remains identical

**Rationale:**
- Backward compatible; DrawTab doesn't need changes
- Refactoring is internal
- Easier to review and deploy

### Decision 4: Pure reducer (no side effects)

**Choice:** `cardReducer` is a pure function; effects dispatch actions

**Rationale:**
- Pure functions are testable, reversible, and easy to reason about
- Side effects (probe iframe, queue slot, iframe events) are in hooks, isolated from logic
- Logging/debugging is simpler

### Decision 5: `pendingArgs` as explicit state, not `pendingArgsRef`

**Choice:** Model queued args as `state.pendingArgs` instead of a ref

**Rationale:**
- Makes queuing explicit and testable
- If args arrive while loading, `ARGS_CHANGED` action checks `liveReady` and queues if needed
- On `IFRAME_LOADED`, transition applies queued args
- Easier to understand than a ref workaround

---

## Known Limitations & Future Work

### Current Limitation 1: `pendingArgs` is synchronous

**Issue:** If args change multiple times while iframe is loading, only the last value is queued.

**Impact:** Low (argsForm is not rapid-fire; user scrubs one value at a time)

**Future:** If needed, change `pendingArgs` to a queue (array of updates).

### Current Limitation 2: No per-args caching

**Issue:** Ghost is always cached with empty args (default state). Per-args ghosts would require hashing args and multiplying cache entries.

**Impact:** None currently (Draw tab always uses default args for placement)

**Future:** If user needs custom-args placement, add `argsHash` to cache key + expand cache limits.

### Current Limitation 3: No retry on error

**Issue:** If probe or iframe load fails, user must refresh the panel or click gear to retry.

**Impact:** Low (Storybook failures are rare; error state is visible)

**Future:** Add "retry" button in error state → dispatch `REQUEST_LIVE_REFRESH`.

---

## Related Specs

- [023-iframe-and-ghost](../023-iframe-and-ghost/) — adaptive-iframe design
- [022-storybook-addon-minimal](../022-storybook-addon-minimal/) — Storybook integration
- [011-draw-with-components](../011-draw-with-components/) — Draw tab inception

---

## Appendix: Detailed Reducer Transitions

### State: IDLE

```
Action: BECOME_VISIBLE
  → VISIBLE (next = CACHED if cachedGhostHtml, else PROBING)

Other actions: no-op
```

### State: CACHED

```
Action: REQUEST_LIVE_REFRESH
  → PROBING (user clicked gear or arm on cached component)

Action: ARM
  → ARMED (user clicked card to arm for placement)

Other actions: no-op
```

### State: PROBING

```
Action: PROBE_COMPLETE
  → PROBE_DONE (with bestStory, argTypes, defaultArgs)

Action: PROBE_FAILED
  → ERROR (with error message)

Other actions: no-op
```

### State: PROBE_DONE

```
Action: SLOT_ACQUIRED
  → QUEUED (queue slot granted by useIframeSlot)

Other actions: no-op (waiting for slot)
```

### State: QUEUED

```
Action: SLOT_ACQUIRED (signal that it's now okay to load)
  → LOADING (assign iframe.src)

Other actions: no-op (waiting for slot to become active)
```

### State: LOADING

```
Action: IFRAME_LOADED (with optional storyBackground)
  → READY (liveReady = true, with storyBackground, pendingArgs cleared)

Action: IFRAME_ERROR (with error message)
  → ERROR (with error message)

Action: ARGS_CHANGED (while !liveReady)
  → LOADING (pendingArgs = new args, phase unchanged — queuing)

Action: ARGS_CHANGED (while liveReady — invalid state, but handle gracefully)
  → LOADING (apply args immediately? or queue? → see Bridge Effects below)

Other actions: no-op (waiting for iframe)
```

### State: READY

```
Action: ARGS_CHANGED
  → READY (update state.args; callback triggers updateArgs() on adaptive-iframe)

Action: ARM
  → ARMED (user clicked card for placement)

Action: GHOST_EXTRACTED (from adaptive-iframe on re-render)
  → READY (update storyBackground; trigger onGhostExtracted callback for caching)

Other actions: no-op
```

### State: ARMED

```
Action: DISARM
  → READY (user placed, or pressed Escape in overlay)

Other actions: no-op (waiting for user to place)
```

### State: ERROR

```
Action: REQUEST_LIVE_REFRESH
  → PROBING (user clicked "retry" or gear icon after error)

Other actions: no-op (stuck until retry requested)
```

---

## Appendix: Bridge Effects

These effects translate external hook outputs and events into actions:

```typescript
// Bridge: useStoryProbe outputs
useEffect(() => {
  if (!probing && bestStory) {
    dispatch({ type: 'PROBE_COMPLETE', bestStory, argTypes, defaultArgs });
  } else if (probing && previousProbing.current) {
    // Probe started but shouldn't have (invalid transition?) — log warning
  }
  previousProbing.current = probing;
}, [probing, bestStory, argTypes, defaultArgs]);

// Bridge: useIframeSlot outputs
useEffect(() => {
  if (canLoad && !previousCanLoad.current) {
    dispatch({ type: 'SLOT_ACQUIRED' });
  }
  previousCanLoad.current = canLoad;
}, [canLoad]);

// Bridge: visibility detection (IntersectionObserver)
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !previousVisible.current) {
      dispatch({ type: 'BECOME_VISIBLE' });
    }
    previousVisible.current = entry.isIntersecting;
  }, { rootMargin: '200px' });
  observer.observe(cardRef.current);
  return () => observer.disconnect();
}, []);

// Bridge: adaptive-iframe events
useEffect(() => {
  const el = ghostRef.current;
  if (!el) return;
  
  const onLoaded = () => dispatch({ type: 'IFRAME_LOADED', storyBackground: ... });
  const onError = (e) => dispatch({ type: 'IFRAME_ERROR', message: e.detail.message });
  const onExtracted = (e) => {
    dispatch({ type: 'GHOST_EXTRACTED', storyBackground: e.detail.storyBackground });
    onGhostExtracted?.(/* submit to cache */);
  };
  
  el.addEventListener('iframe-loaded', onLoaded);
  el.addEventListener('iframe-error', onError);
  el.addEventListener('ghost-extracted', onExtracted);
  
  return () => {
    el.removeEventListener('iframe-loaded', onLoaded);
    el.removeEventListener('iframe-error', onError);
    el.removeEventListener('ghost-extracted', onExtracted);
  };
}, [bestStory, /* deps */]);

// Bridge: user actions (props passed from parent or events)
useEffect(() => {
  return onMessage((msg) => {
    if (msg.type === 'COMPONENT_DISARMED') {
      dispatch({ type: 'DISARM' });
    }
  });
}, []);

// Bridge: adaptive-iframe src assignment (when slot acquired + story resolved)
useEffect(() => {
  if (state.phase === 'loading' && state.bestStory && canLoad) {
    ghostRef.current?.setAttribute('src', buildArgsUrl(state.bestStory.id, {}));
  }
}, [state.phase, state.bestStory, canLoad]);
```

These effects handle the "glue" between the pure reducer and the external systems (probe, queue, iframe, visibility, messages). They're still effects, but they're now simpler and grouped by concern.
