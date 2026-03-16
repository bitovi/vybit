# 009 — Context Messages & Commit Grouping

## Overview

Group individual patches into first-class **Commit** objects so a user can make multiple design changes across multiple elements, interleave free-form **message patches** explaining intent, and submit everything as a single unit. The MCP server delivers one commit at a time (with all its patches in order), and the AI agent reports per-patch implementation results.

A **message** is a special kind of patch — not a separate concept. This means messages are ordered alongside class changes, giving the agent a natural narrative: change A, explanation of A, change B, explanation of B.

A new **tab bar** at the top of the panel enables switching between the **Design** (Picker), **Message** (compose + stage a message patch), and **Draw** (coming later — disabled placeholder) views.

## Motivation

Today each patch is an independent unit: one class change on one element, committed individually. This creates several problems:

1. **No way to communicate intent** — the AI agent sees raw class swaps but has no textual context about *why* the user is making changes or what the overall goal is.
2. **Related changes are disconnected** — changing a card title's font *and* its description's font are two separate patches with no link between them. The agent processes them independently.
3. **No multi-element workflows** — switching to a new element clears all staged patches, preventing a user from building up a set of related changes across elements.

Commits solve all three: a user stages class-change patches across any number of elements, interleaves message patches to explain intent, and commits them as one ordered group.

## Vocabulary

| Term | Definition |
|------|-----------|
| **Patch** | A single item in the draft/commit queue. Has a `kind` discriminator: `'class-change'` or `'message'`. |
| **Class-change patch** | `kind: 'class-change'` — the existing patch type. A single class swap on a single element: `{ originalClass, newClass, property, context, ... }`. |
| **Message patch** | `kind: 'message'` — a text annotation staged by the user. `{ message, elementKey? }`. Class-change fields (`originalClass`, `newClass`, `property`) are not used. If `elementKey` is set, the message is scoped to that element; if empty, it's general context. |
| **Commit** | An ordered group of patches (class-changes + messages). First-class object: `{ id, patches[], status, timestamp }`. |
| **Draft** | The set of staged patches that haven't been committed yet. One draft exists at a time. Patches accumulate into the draft as the user interacts — even across element switches. |
| **Tab Bar** | Horizontal navigation at the top of the panel: Design · Message · Draw. |

---

## User Flow

```
 1. User clicks an element in the page
       │
       ▼
 2. Panel shows the Picker (Design tab) with the element's classes
       │
       ▼
 3. User scrubs/selects values → class-change patches are staged
       │
       ▼
 4. User switches to Message tab → types "Make description more readable"
       │  └── Clicks "Add Message" → a message patch is staged in the draft
       │  └── Message patch is ordered AFTER the previous class-change patches
       ▼
 5. User switches back to Design tab
       │
       ▼
 6. User clicks a DIFFERENT element (e.g. card title after card description)
       │  └── Staged patches (class-changes + messages) are PRESERVED
       │  └── Local UI state (overrides, pending prefixes) resets for new element
       ▼
 7. User makes more changes → more class-change patches staged
       │
       ▼
 8. User switches to Message tab → types "Bold the title for emphasis"
       │  └── Clicks "Add Message" → another message patch staged
       ▼
 9. User clicks "Commit All" (visible in the queue footer on any tab)
       │  └── Panel sends PATCH_COMMIT { ids: [...] }
       │  └── Server wraps all staged patches (class-changes + messages, in order)
       │      into a Commit, status → committed
       │  └── Draft is cleared
       ▼
10. AI agent calls implement_next_change
       │  └── Receives the full commit with patches in order:
       │      1. class-change: text-sm → text-base  (description)
       │      2. message: "Make description more readable"
       │      3. class-change: font-normal → font-bold  (title)
       │      4. message: "Bold the title for emphasis"
       │  └── Agent uses messages as context while implementing class-changes
       ▼
11. Agent calls mark_change_implemented { commitId, results: [...] }
       │  └── Results only needed for class-change patches (messages are informational)
       │  └── Server transitions commit to implemented / partial / error
       └── Agent calls implement_next_change again (loop continues)
```

---

## Data Model

### Patch Kind

The existing `Patch` type gains a `kind` discriminator and an optional `message` field:

```ts
type PatchKind = 'class-change' | 'message';

interface Patch {
  id: string;               // UUID
  kind: PatchKind;          // NEW — discriminator
  elementKey: string;        // stable identifier (empty string for general messages)
  status: PatchStatus;
  // Class-change fields (used when kind === 'class-change'):
  originalClass: string;
  newClass: string;
  property: string;
  timestamp: string;         // ISO 8601
  pageUrl?: string;
  component?: { name: string };
  target?: { tag: string; classes: string; innerText: string };
  context?: string;
  errorMessage?: string;
  // Message field (used when kind === 'message'):
  message?: string;          // NEW — free-form text
  // Commit reference:
  commitId?: string;         // Set when committed into a Commit
}
```

**Backward compatibility:** Existing patches default to `kind: 'class-change'`. The `message` field is ignored for class-change patches. The `originalClass`/`newClass`/`property` fields are empty strings for message patches.

### Commit Type

```ts
type CommitStatus = 'staged' | 'committed' | 'implementing' | 'implemented' | 'partial' | 'error';

interface Commit {
  id: string;               // UUID
  patches: Patch[];         // Ordered: class-changes AND messages interleaved
  status: CommitStatus;
  timestamp: string;        // ISO 8601 — set when committed
}
```

Note: The `Commit` type has **no top-level `message` field**. Messages live in the patch array, ordered alongside class-changes.

Status transitions:

```
staged → committed → implementing → implemented
                                  → partial (some class-change patches failed)
                                  → error (all class-change patches failed)
```

### CommitSummary (for WS broadcasts)

```ts
interface CommitSummary {
  id: string;
  patchCount: number;       // total patches (class-changes + messages)
  classChangeCount: number; // just class-change patches
  messageCount: number;     // just message patches
  status: CommitStatus;
  timestamp: string;
}
```

### PatchSummary Update

The existing `PatchSummary` type gains the `kind` and `message` fields:

```ts
interface PatchSummary {
  id: string;
  kind: PatchKind;          // NEW
  elementKey: string;
  status: PatchStatus;
  originalClass: string;
  newClass: string;
  property: string;
  timestamp: string;
  component?: { name: string };
  errorMessage?: string;
  message?: string;         // NEW — for message patches
}
```

---

## WebSocket Message Changes

### PatchCommitMessage — no `message` field needed

Since messages are patches, the commit message just sends patch IDs:

```ts
/** Panel → Server: finalize the draft into a Commit */
interface PatchCommitMessage {
  type: 'PATCH_COMMIT';
  ids: string[];            // includes both class-change AND message patch IDs
}
```

This is **unchanged from today's schema** — no new fields needed.

### New: MessageStageMessage

A new message type for staging message patches. Unlike class-change patches (which go overlay → server via `PATCH_STAGED`), message patches are sent directly from the panel to the server since they don't need DOM context:

```ts
/** Panel → Server: stage a message patch */
interface MessageStageMessage {
  type: 'MESSAGE_STAGE';
  id: string;               // UUID (generated by panel)
  message: string;          // the user's text
  elementKey?: string;      // optional — current element, or empty for general context
}
```

### QueueUpdateMessage (renamed from `PATCH_UPDATE`)

Replaces the old `PATCH_UPDATE`. The payload now models the queue as **draft + commits** rather than flat patch lists. The draft (staged patches) is sent as an ordered array preserving insertion order — the UI renders it grouped the same way it renders commits.

```ts
/** Server → Panel: broadcast full queue state */
interface QueueUpdateMessage {
  type: 'QUEUE_UPDATE';
  // Counts for the footer pills
  draftCount: number;       // patches in the draft (staged, not yet committed)
  committedCount: number;   // commits with status 'committed'
  implementingCount: number;
  implementedCount: number;
  partialCount: number;
  errorCount: number;
  // Draft: the in-progress group (ordered by insertion)
  draft: PatchSummary[];    // all staged patches in order (class-changes + messages)
  // Finalized commits by status
  commits: CommitSummary[]; // includes patches[] for rendering grouped lists
}
```

The `CommitSummary` includes the full patch list so the panel can render grouped popovers without a separate fetch:

```ts
interface CommitSummary {
  id: string;
  status: CommitStatus;
  timestamp: string;
  patches: PatchSummary[];  // ordered — class-changes and messages interleaved
}
```

---

## Panel UI

### Tab Bar

A horizontal tab bar rendered at the top of the panel content area (below connection status, above the Picker/content):

```
┌──────────────────────────────────────┐
│  Design     Message     Draw         │
│  ───────                (disabled)   │
│                                      │
│  [ current tab content ]             │
│                                      │
├──────────────────────────────────────┤
│  draft: 3  ·  1 committed  ·  0 implementing  ·  2 implemented  │
└──────────────────────────────────────┘
```

Footer counts: `draftCount` uses "patch" granularity (pre-commit, shows how many items are staged); `committedCount`, `implementingCount`, `implementedCount` use commit granularity (one commit = one logical change).

**Tabs:**

| Tab | State | Behavior |
|-----|-------|----------|
| **Design** | Active by default | Renders the existing `<Picker>` component |
| **Message** | Enabled | Renders a `<MessageTab>` — compose + stage message patches |
| **Draw** | Disabled | Grayed out, shows "Coming soon" tooltip on hover. See spec 007 for future plans. |

### Queue Footer & Popover Grouping

Every status pill in the footer opens a popover. All popovers use the same **grouped structure** — the draft is treated as a single "commit in progress":

**Draft popover (staged patches):**
```
Draft — 3 patches
┌─────────────────────────────────────────┐
│ In progress                             │
│  ≡ text-sm → text-base   (Card > <p>)  │
│  💬 "Make description more readable"    │
│  ≡ font-normal → font-bold (Card > <h2>)│
│                          [Commit All] [×]│
└─────────────────────────────────────────┘
```

**Committed popover (finalized commits):**
```
Committed — 1 commit
┌─────────────────────────────────────────┐
│ Commit  abc-123                         │
│  ≡ text-sm → text-base   (Card > <p>)  │
│  💬 "Make description more readable"    │
│  ≡ font-normal → font-bold (Card > <h2>)│
└─────────────────────────────────────────┘
```

**Implemented / partial popover:** Same structure. Patches with `status: 'error'` shown in red with error message.

Key points:
- Draft patches render in insertion order (class-changes + messages interleaved)
- Message patches render as `💬 "text"` with element scope label below if scoped
- Class-change patches render as `≡ old → new  (Component > <tag>)`
- Individual staged patches can be discarded (× button per row in the draft)
- Entire commits can be discarded once committed

**Styling:**

- Active tab: `bv-teal` (#00848B) bottom border (2px), `bv-text` color
- Inactive tab: no border, `bv-text-mid` color, hover → `bv-text`
- Disabled tab: `bv-muted` color, `cursor: not-allowed`, tooltip on hover
- Font: `font-ui` (Inter), 12px, medium weight
- Tab bar border-bottom: `bv-border`

### Message Tab

The Message tab lets the user compose and stage message patches. It is **not** a single persistent textarea — each submission creates a new message patch in the draft.

```
┌──────────────────────────────────────┐
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Add context for the AI agent…  │  │
│  │                                │  │
│  │                                │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                          [Add Message]│
│                                      │
│  ── Staged messages ──────────────── │
│                                      │
│  💬 "Make description more readable" │
│     Card > <p>           [× discard] │
│                                      │
│  💬 "Bold the title for emphasis"    │
│     Card > <h2>          [× discard] │
│                                      │
└──────────────────────────────────────┘
```

**Compose area:**
- Textarea with placeholder: "Add context for the AI agent…"
- "Add Message" button — stages a message patch and clears the textarea
- Keyboard shortcut: Cmd+Enter / Ctrl+Enter to stage
- Character count in bottom-right, `bv-muted` color
- If an element is currently selected, the message patch is scoped to it (shown below the message)
- If no element is selected, the message is general context

**Staged messages list:**
- Shows all `kind: 'message'` patches in the current draft, in order
- Each shows the message text and (if scoped) the element it's associated with
- Discard button (×) removes individual message patches
- Messages interleave with class-change patches in the draft order — this list only shows the message subset

**Styling:**
- Textarea: `bv-bg` background, `bv-border` border, `font-ui` 13px
- "Add Message" button: `bv-teal` background, white text, rounded, small
- Staged messages: `bv-surface` background cards, `font-ui` 12px, `bv-text` color
- Element scope label: `bv-text-mid`, 11px

### Multi-Element Draft Behavior

Currently, `patchManager.reset()` is called when the selected element changes, clearing all staged patches. This must change:

**Before (current):** Element switch → clear staged patches + local UI state → start fresh

**After:** Element switch → clear local UI state only (box model overrides, pending prefixes) → staged patches persist across elements

This lets a user:
1. Click card description → change `text-sm` to `text-base`
2. Message tab → "Make description more readable" → Add Message
3. Click card title → change `font-normal` to `font-bold`
4. Message tab → "Bold the title for emphasis" → Add Message
5. Commit → all 4 patches (2 class-changes + 2 messages) go to the agent in order

---

## Server: Commit-Aware Queue

### Refactored `server/queue.ts`

Replace the flat `patches[]` array with a **draft + commits** model:

```ts
// Mutable draft: accumulates patches as the user stages them (preserves insertion order)
const draftPatches: Patch[] = [];

// Finalized commits
const commits: Commit[] = [];
```

**Key operations:**

| Function | Behavior |
|----------|----------|
| `addPatch(patch)` | Adds to `draftPatches[]`. For `kind: 'class-change'`: dedup by elementKey+property (as today). For `kind: 'message'`: always append (no dedup — multiple messages are allowed). |
| `commitDraft(ids)` | Creates a `Commit` from matching draft patches **preserving their order**, sets status to `committed`, removes them from draft, emits `committed` event |
| `getNextCommitted()` | Returns the oldest `Commit` with status `committed`, or `null` |
| `markImplementing(commitId)` | Transitions commit to `implementing` |
| `markImplemented(commitId, results)` | Transitions commit based on per-patch results (see below) |
| `getCounts()` | Returns counts at both commit and patch level |
| `getQueueUpdate()` | Returns full state for `QUEUE_UPDATE` broadcast (draft + commits) |
| `clearAll()` | Clears draft + all commits |

### Message Patch Handling

When the server receives a `MESSAGE_STAGE` message:

```ts
if (msg.type === 'MESSAGE_STAGE') {
  const patch: Patch = {
    id: msg.id,
    kind: 'message',
    elementKey: msg.elementKey ?? '',
    status: 'staged',
    originalClass: '',
    newClass: '',
    property: '',
    timestamp: new Date().toISOString(),
    message: msg.message,
  };
  addPatch(patch);
  broadcastPatchUpdate();
}
```

### `markImplemented` Result Handling

```ts
interface PatchResult {
  patchId: string;
  success: boolean;
  error?: string;
}

function markImplemented(commitId: string, results: PatchResult[]): void {
  const commit = commits.find(c => c.id === commitId);
  if (!commit) return;

  // Apply results to class-change patches
  for (const result of results) {
    const patch = commit.patches.find(p => p.id === result.patchId);
    if (!patch) continue;
    patch.status = result.success ? 'implemented' : 'error';
    if (result.error) patch.errorMessage = result.error;
  }

  // Message patches are always "implemented" (informational, no action needed)
  for (const patch of commit.patches) {
    if (patch.kind === 'message') patch.status = 'implemented';
  }

  const classChanges = commit.patches.filter(p => p.kind === 'class-change');
  const allSucceeded = classChanges.every(p => p.status === 'implemented');
  const allFailed = classChanges.every(p => p.status === 'error');

  commit.status = classChanges.length === 0 ? 'implemented'  // message-only commit
               : allSucceeded               ? 'implemented'
               : allFailed                   ? 'error'
               :                               'partial';
}
```

### WebSocket Handler Update

In `server/websocket.ts`, handle the new `MESSAGE_STAGE` message and updated commit flow:

```ts
// New: handle message patches
if (msg.type === 'MESSAGE_STAGE') {
  const patch = addPatch({
    id: msg.id,
    kind: 'message',
    elementKey: msg.elementKey ?? '',
    status: 'staged',
    originalClass: '',
    newClass: '',
    property: '',
    timestamp: new Date().toISOString(),
    message: msg.message,
  });
  console.error(`[ws] Message patch staged: #${patch.id}`);
  broadcastPatchUpdate();
}

// Updated: commit now uses commitDraft (no message param — messages are in the patches)
if (msg.type === 'PATCH_COMMIT') {
  const commit = commitDraft(msg.ids);
  console.error(`[ws] Commit created: #${commit.id} (${commit.patches.length} patches)`);
  broadcastPatchUpdate();
}
```

---

## MCP Tools

### `implement_next_change` — Returns Full Commit with Interleaved Messages

Returns the entire commit as a multi-part MCP response. Messages are woven into the instructions alongside class-changes so the agent sees context in order.

**Content block 1 — JSON data:**
```json
{
  "isComplete": false,
  "nextAction": "implement all class-change patches in this commit, call mark_change_implemented, then call implement_next_change again",
  "commit": {
    "id": "abc-123",
    "patches": [
      { "id": "p1", "kind": "class-change", "component": { "name": "Card" }, "originalClass": "text-sm", "newClass": "text-base", "..." : "..." },
      { "id": "m1", "kind": "message", "message": "Make description more readable" },
      { "id": "p2", "kind": "class-change", "component": { "name": "Card" }, "originalClass": "font-normal", "newClass": "font-bold", "..." : "..." },
      { "id": "m2", "kind": "message", "message": "Bold the title for emphasis" }
    ]
  },
  "remainingCommits": 0
}
```

**Content block 2 — Markdown instructions:**

```markdown
# IMPLEMENT THIS COMMIT — then call implement_next_change again

## Changes to implement (2 class changes, 2 messages)

### 1. Class change `p1`
- **Component:** `Card`
- **Element:** `<p>`
- **Class change:** `text-sm` → `text-base`
- **Context HTML:** ...

### 2. User message
> Make description more readable

### 3. Class change `p2`
- **Component:** `Card`
- **Element:** `<h2>`
- **Class change:** `font-normal` → `font-bold`
- **Context HTML:** ...

### 4. User message
> Bold the title for emphasis

## Steps
1. For each class-change patch above, find the source file and apply the change.
   Use the user messages as additional context for understanding intent.
2. Call `mark_change_implemented` with:
   { "commitId": "abc-123", "results": [
     { "patchId": "p1", "success": true },
     { "patchId": "p2", "success": true }
   ]}
   (Only report results for class-change patches — messages are informational.)
3. IMMEDIATELY call `implement_next_change` again.
```

### `mark_change_implemented` — Per-Patch Results

**New input schema:**
```ts
{
  commitId: z.string().describe("The commit ID"),
  results: z.array(z.object({
    patchId: z.string().describe("ID of a class-change patch"),
    success: z.boolean(),
    error: z.string().optional(),
  })).describe("Per-patch results (class-change patches only — skip message patches)"),
}
```

**Backward compatibility:** If `commitId` is not provided but `ids` is (old schema), fall back to the current behavior of marking individual patches as implemented.

### `get_next_change` — Commit-Level

Returns the raw commit data (no instructions) for custom agent workflows.

### `list_changes` — Commit-Grouped

Returns commits grouped by status:

```json
{
  "draft": { "patchCount": 4, "classChangeCount": 2, "messageCount": 2, "patches": ["..."] },
  "commits": {
    "committed": [{ "id": "abc", "patchCount": 4, "classChangeCount": 2, "messageCount": 2 }],
    "implementing": [],
    "implemented": [{ "id": "xyz", "patchCount": 1, "classChangeCount": 1, "messageCount": 0 }],
    "partial": [],
    "error": []
  }
}
```

### `discard_all_changes` — Clears Everything

Clears both the draft and all commits. Behavior unchanged from the user's perspective.

---

## Component Architecture

### New Components (Modlet Pattern)

```
panel/src/components/TabBar/
  index.ts              ← re-exports
  TabBar.tsx            ← implementation
  TabBar.test.tsx       ← tests
  types.ts              ← Tab definition type

panel/src/components/MessageTab/
  index.ts              ← re-exports
  MessageTab.tsx        ← implementation
  MessageTab.test.tsx   ← tests
```

### TabBar Props

```ts
interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;       // Shown on hover when disabled
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}
```

### MessageTab Props

```ts
interface MessageTabProps {
  /** Currently staged patches (all kinds) — used to show staged message list */
  patches: Patch[];
  /** The currently selected element key, or empty if no element selected */
  currentElementKey: string;
  /** The currently selected component name (for display) */
  currentComponentName?: string;
  /** Callback to stage a new message patch */
  onAddMessage: (message: string, elementKey: string) => void;
  /** Callback to discard a message patch */
  onDiscard: (id: string) => void;
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `shared/types.ts` | Add `PatchKind`, `Commit`, `CommitStatus`, `CommitSummary`, `MessageStageMessage`, `QueueUpdateMessage`; add `kind` + `message` to `Patch` and `PatchSummary`; remove old `PatchUpdateMessage`; add to union types |
| `server/queue.ts` | Major refactor: draft + commits model; `addPatch` handles both kinds; `commitDraft(ids)` (no message param); `markImplemented(commitId, results)` with message-patch auto-success; `getQueueUpdate()` replaces `getPatchUpdate()` |
| `server/websocket.ts` | Handle `MESSAGE_STAGE`; use `commitDraft` instead of `commitPatches`; broadcast `QUEUE_UPDATE` instead of `PATCH_UPDATE` |
| `server/mcp-tools.ts` | Return full commit with interleaved messages in `implement_next_change`; per-patch results in `mark_change_implemented`; commit-grouped `list_changes` |
| `panel/src/App.tsx` | Add `activeTab` state; render `TabBar` + conditional content; handle `QUEUE_UPDATE` instead of `PATCH_UPDATE`; thread message staging to `usePatchManager` |
| `panel/src/Picker.tsx` | Remove `patchManager.reset()` on element switch; only reset local UI state |
| `panel/src/hooks/usePatchManager.ts` | Add `stageMessage(message, elementKey)` method; `commitAll()` (no message param); remove patch-clearing from `reset()`; handle `QUEUE_UPDATE` shape |
| `panel/src/ws.ts` | Add `MESSAGE_STAGE` to sent message types; update received message types for `QUEUE_UPDATE` |
| `panel/src/components/TabBar/` | **New** — tab bar component |
| `panel/src/components/MessageTab/` | **New** — compose + stage message patches, list staged messages |
| `panel/src/components/PatchPopover/PatchPopover.tsx` | Render grouped view for all statuses: draft as "in progress" group, commits as named groups; 💬 for message patches, ≡ for class-change patches; individual discard per row in draft |

---

## Verification

1. **Unit tests — `server/queue.ts`**: Draft accumulation with mixed patch kinds; message patches are not deduped; commit preserves insertion order; `markImplemented` auto-succeeds message patches; partial status when class-change fails but messages exist
2. **Unit tests — `TabBar`**: Renders 3 tabs, active tab styling, disabled tab non-clickable + tooltip, tab switch callback
3. **Unit tests — `MessageTab`**: Renders textarea + "Add Message" button; stages a message patch on click; shows staged messages list; discard removes message; Cmd+Enter shortcut
4. **Unit tests — MCP tools**: Mock `getNextCommitted` returning a Commit with interleaved class-changes + messages; verify markdown instructions show messages inline; `mark_change_implemented` only requires class-change results
5. **Integration test**: Stage class-change → stage message → stage class-change on different element → stage message → commit → verify server creates Commit with 4 patches in order
6. **E2E test**: Select element A → change class → Message tab → add message → select element B → change class → Message tab → add message → commit → verify MCP response has all 4 in order
7. **Manual**: Tab UI matches Bitovi design tokens; disabled Draw tab shows "Coming soon" tooltip; multi-element draft persists; messages appear in PatchPopover

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Messages are a patch kind (`kind: 'message'`), not a separate concept | Reuses existing infrastructure (staging, queue, WS, commits). Enables interleaved ordering — agent sees messages in context next to the changes they describe. Multiple messages allowed. |
| No top-level `message` on Commit | Messages live in the ordered patch array. No need for a separate field. |
| First-class `Commit` object | Commits group patches structurally and own the status lifecycle |
| One commit per MCP call | Agent receives all patches (class-changes + messages) together in order |
| Per-patch result reporting (class-changes only) | Agent reports success/failure for class-change patches; message patches auto-succeed |
| Draw tab shown as disabled placeholder | User sees the full vision; "Coming soon" sets expectations (see spec 007) |
| `MESSAGE_STAGE` goes panel → server directly | Message patches don't need DOM context from the overlay (unlike class-changes which go panel → overlay → server) |
| Staged patches survive element switches | Multi-element drafts are the primary use case for commits |
| Message patches are not deduped | Unlike class-changes (dedup by elementKey+property), every message is unique and appended |
| Backward-compatible `Patch` type | `kind` defaults to `'class-change'`; `message` field is optional; existing code continues to work |

---

## Future Considerations

- **Draw patches** — When spec 007 is implemented, `kind: 'draw'` becomes a third patch kind with a `image` field (base64 PNG). Same interleaving model: draw patches ordered alongside class-changes and messages.
- **Commit history view** — A dedicated panel view showing past commits + their implementation status
- **Patch timeline** — A visual timeline in the Message tab showing all patches (class-changes + messages) in draft order, so the user sees the full narrative they're building
- **Patch reordering** — Allow users to drag patches to reorder them within the draft before committing
- **Scoped vs general messages** — UI affordance to explicitly mark a message as general context (not scoped to any element) vs element-specific
