# Spec 013 — No-Agent Waiting Warning

## Problem

When a user commits changes in the panel, those commits sit in the server queue with `status: 'committed'`. An AI agent must call `implement_next_change` (or `get_next_change`) to pick them up. That tool **long-polls** — it subscribes to the `'committed'` event on the server's in-memory emitter and only returns when a commit arrives.

If no agent is currently waiting on that poll, committed changes will sit in the queue indefinitely with no indication to the user. The user has no way to know whether their changes are being watched or are just stuck.

**Trigger condition:**
```
committedCount > 0  &&  agentWaiting === false
```

Where `agentWaiting` is `true` when at least one call to `implement_next_change` or `get_next_change` is actively suspended, awaiting the next commit.

---

## Goal

Give the user clear, contextual feedback when:
1. They have committed changes sitting in the queue, **and**
2. No agent is currently polling the server for them.

The feedback should:
- Explain the situation briefly (changes are waiting, no agent is watching)
- Tell the user the exact action to take (ask the agent to call `implement_next_change`)
- Not be alarming — this is a common workflow state, not an error
- Disappear automatically once an agent connects

---

## Server Changes

### `server/queue.ts` — expose `agentWaiting` in queue update

The in-memory `EventEmitter` instance tracks listeners. When `implement_next_change` is long-polling, it registers a listener on the `'committed'` event via `onCommitted()`. The listener count therefore represents active polling agents.

```ts
// in getQueueUpdate():
agentWaiting: emitter.listenerCount('committed') > 0,
```

This boolean is already derivable from the existing emitter with zero additional state.

### `shared/types.ts` — add field to queue payload type (if typed)

If `QueueUpdatePayload` is defined, add `agentWaiting: boolean`.

### `server/websocket.ts` — no change needed

The `broadcastPatchUpdate()` function already calls `getQueueUpdate()`, so the field propagates automatically to the panel via `QUEUE_UPDATE`.

---

## Panel Changes

### `panel/src/hooks/usePatchManager.ts`

1. Add `agentWaiting: boolean` to `PatchManager` interface
2. Accept `agentWaiting?: boolean` in `handleQueueUpdate` data type
3. Hold it in `useState(false)` — defaults to `false` (safest assumption)
4. Return it from the hook

```ts
const [agentWaiting, setAgentWaiting] = useState(false);

// in handleQueueUpdate:
setAgentWaiting(!!data.agentWaiting);

// in return:
agentWaiting,
```

### `panel/src/App.tsx`

Forward `agentWaiting` from the `QUEUE_UPDATE` message to `handleQueueUpdate`.

### Warning component / placement

Render the warning when `committed > 0 && !agentWaiting`. See **UI Options** below for placement choices.

---

## UI Options

See `no-agent-warning-prototype.html` in this directory for interactive demos of all four options.

### Option A — Inline Footer Strip (Recommended for MVP)

A thin, single-line strip rendered **above the queue footer**, between the panel body and the footer row. Uses the `bv-orange` accent (≠ error red — this is a guidance state, not a failure).

**Copy:** `No agent watching — ask your AI agent: "implement_next_change"`  
**Icon:** `⚠` or a robot icon  
**CTA:** Copy-to-clipboard button for the prompt string

**Pros:** Low visual weight; doesn't interrupt the inspect workflow; auto-hides  
**Cons:** May be missed if user is not looking at the footer

---

### Option B — Committed Count Badge with Warning State

The `committed` pill in the queue footer changes appearance when in the warning state:
- Color shifts from muted to `bv-orange`
- A `⚠` prefix glyph appears alongside the count
- Hovering reveals a tooltip with instructions

**Pros:** Follows existing conventions; zero extra layout space; unobtrusive  
**Cons:** Small target; tooltip text may be too brief for new users

---

### Option C — Body Callout Card

A full-width info card rendered inside the panel body area (when the panel has no element selected, or pinned above the property chips). Provides the most real estate for explanation.

**Copy:**  
**Headline:** "AI agent not watching"  
**Body:** "You have N committed change(s) waiting. Ask your AI agent to run `implement_next_change` to apply them."  
**CTA:** "Copy prompt" button

**Pros:** Hard to miss; full explanation visible at a glance  
**Cons:** Takes up body space; visually heavy if the user is mid-inspect-workflow

---

### Option D — Slim Top Banner

A 28px strip pinned below the panel header (above the tabs). Styled like a system notification bar. Slides in when condition is true, slides out when false.

**Copy:** `⚠ Changes waiting — no agent connected. Ask: "implement_next_change"`  
**CTA:** `×` dismiss (dismisses for the session only; reappears on reload or new commit)

**Pros:** High visibility; doesn't interfere with footer or body  
**Cons:** Eats 28px of vertical space; may feel urgent for what is actually a normal workflow state

---

## Recommended Approach

**Option A (footer strip)** for MVP:
- Lowest implementation cost
- Doesn't disrupt the real-time inspect flow
- Contextually placed next to the queue counters it explains

If user research shows the strip is missed, promote to **Option D** (top banner).

**Option B** (modified committed pill) works well as a complementary enhancement to whichever primary option is chosen — the pill turning amber even without a strip reinforces the state visually.

---

## States & Transitions

| Condition | Warning shown |
|-----------|---------------|
| `committedCount === 0` | No — nothing waiting |
| `committedCount > 0 && agentWaiting === true` | No — agent is handling it |
| `committedCount > 0 && agentWaiting === false` | **Yes** |
| `committedCount > 0 && implementingCount > 0` | No — at least one commit is actively being processed |

The warning should also suppress itself while `implementingCount > 0` to avoid showing it mid-implementation (agent started, is working, will loop back).

---

## Copy

| Context | Copy |
|---------|------|
| Short (footer strip / banner) | No agent watching — ask: `implement_next_change` |
| Medium (tooltip) | You have committed changes but no AI agent is waiting. Ask your agent: "implement_next_change" |
| Full (callout card) | You have {N} committed change{s} waiting in the queue. No AI agent is currently monitoring for new changes. Ask your AI agent to run `implement_next_change` to apply them to your code. |

---

## Out of Scope

- Actually initiating an agent connection from the panel (no button to "start agent")
- Showing which agent is connected (agent identity is not passed through the current architecture)
- Persistent dismissed state beyond the page session
