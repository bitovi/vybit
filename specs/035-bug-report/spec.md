# 035 — Bug Report Mode

## Summary

Add always-on background recording to the overlay and a **Bug Report** mode to the panel. The overlay silently captures DOM mutations, viewport screenshots, console logs, and network errors into IndexedDB. Users switch to Bug Report mode, browse a grouped event timeline, select a range of primary events, optionally deselect individual sub-items, describe the issue, and submit it as a `bug-report` patch that flows through the existing queue to the AI agent via MCP.

## Motivation

Currently VyBit can only send *known changes* (class swaps, text edits, component drops) to the agent. There's no way to say "something is broken, go fix it." A recording + bug report pipeline gives users a way to capture exactly what happened — console errors, DOM state, screenshots — and hand it to the agent as a rich, contextual bug report.

---

## UX

### Mode Toggle

The existing `Select | Insert` toggle in the panel header gains a third button: **Bug Report** (🐛 icon). All three buttons become **icon-only** (with title-attribute tooltips) to avoid crowding.

```
 [ 🎯 ] [ ➕ ] [ 🐛 ]     ← icon-only ModeToggle
```

### Landing State

When `mode === null`, the panel shows three CTA cards:

1. **Select an element** — crosshair icon, "change its design, text, or replace it"
2. **Insert to add content** — plus icon, existing description
3. **Report a bug** — bug icon, "Select events from recording history and describe the issue"

### Bug Report Mode

When `mode === 'bug-report'`, the panel renders the `BugReportMode` component. No overlay crosshair, no element selection, no Design/Replace tab bar. Vertical stack layout:

#### Three-Level Information Model

The timeline displays a **grouped tree** of events with three tiers. The underlying recording data is a flat array of snapshots; the panel groups them at render time.

| Level | What | Visibility | Checkbox |
|-------|------|------------|----------|
| **Primary** | User action or promoted event | Always visible | Left of badge, shown only when in range |
| **Secondary** | Consequence summary (per-type, each on its own row) | Always visible under its primary | Indented under primary's checkbox, shown only when in range |
| **Detail** | Actual data content (log messages, screenshot images, DOM diffs) | Expandable on click (future stretch goal — designed now, implemented later) | N/A — inherits from secondary |

##### Primary Events

**Primary events** are user-initiated actions or major transitions that appear as top-level rows:
- `click` — user clicked an element
- `navigation` — SPA route change (pushState/replaceState/popstate) or full-page nav
- `page-load` — initial page load or post-navigation load
- `error` — promoted to primary when it occurs **outside** any primary's grouping window (e.g., a timer callback throws 10 seconds after the last click)
- `background` — synthetic primary created when orphan mutations/logs occur with no preceding user action

##### Secondary Summary Rows

Each secondary type gets **its own row** under the primary, with its own checkbox:
- `mutations` — "2 mutations" (count of DOM changes)
- `screenshot` — "screenshot" (viewport capture)
- `network` — "500 POST /api/comments" (method, URL, status with color coding)
- `logs` — "3 logs (2 errors)" (count with error count highlighted)
- `DOM changes` — "DOM changes" (DOM diff summary)

Secondary rows are always visible — there is no collapsed/expanded toggle for summaries.

##### Detail Expansion (Future)

Clicking a secondary row could expand it to show the **actual data** — the individual log messages, the screenshot image, the DOM diff, the full network request/response. This is a stretch goal: we design the visual treatment now but may implement it at the end.

##### Grouping Window (Hybrid)

Children are assigned to the nearest preceding primary using a **hybrid until-next-primary** rule:
- All snapshots between one primary and the next belong to the first primary
- **Max 5-second cap**: if no new primary arrives within 5 seconds, subsequent orphan snapshots become a new `background` primary
- This adapts naturally: rapid interactions produce tight groups; idle periods produce compact "background update" groups

##### Layout: TIME | CHECKBOX | CONTENT

Row layout uses three columns:

```
TIME (36px)  CHECKBOX (20px)  CONTENT (flex)
──────────── ──────────────── ──────────────────────────
−17s         [✓]              page-load  localhost:5173
                    [✓]       screenshot
                    [✓]       1 mutation

 −5s         [✓]              click  on <button> in CommentForm
                    [ ]       2 mutations          ← unchecked/dimmed
                    [✓]       screenshot
                    [✓]       500 POST /api/comments
                    [✓]       3 logs (2 errors)
```

- The **time column** is fixed-width (36px), right-aligned, only populated on primary rows — shows relative delta from last event (hover for absolute)
- **Primary checkboxes** sit after the time column, before the badge — **always visible** (unchecked by default)
- **Secondary checkboxes** are indented (12px spacer) under the primary checkbox position — **hidden until the parent primary is checked** (then all appear checked by default)
- Unchecked primaries use `visibility: visible` with an empty checkbox; checked primaries show `✓`

##### Time Display

- **Primary events** show a **relative delta** from the last (most recent) primary event in the timeline
- The last primary is the anchor and shows `0s`; earlier events show `−Ns` (e.g. `−17s`, `−5s`)
- For gaps over 60 seconds, use `−Nm` format (e.g. `−2m`)
- **Hover** any delta to see the absolute `HH:MM:SS` timestamp via `title` attribute
- **Absolute time range** still appears in the summary bar below the timeline (e.g. `12:04:34 – 12:04:38`) where there's room
- **Secondary items** do not show timestamps — they inherit temporal context from their parent
- The narrower delta format (`36px` column vs. `52px` for `HH:MM:SS`) reclaims ~16px for content

##### Event Selection

- **Primary checkboxes are always visible** (unchecked by default). Users check individual primaries to include them in the report.
- **Selection is free-form**: any combination of primaries can be checked — non-contiguous selections are allowed.
- Checking a primary reveals its secondary checkboxes, all checked by default.
- **Sub-item deselection**: within a checked primary, individual secondary rows can be unchecked. Unchecked rows appear dimmed/struck-through. This removes them from the bug report payload.
- **Shift+click**: power-user shortcut — shift+clicking a primary checks all primaries between the last-checked primary and the shift+clicked one (inclusive).
- Checked primaries get the teal left-border highlight.
- Unchecking a primary hides its secondary checkboxes and removes it from the selection.

##### Live Updating

- New snapshots arrive in real-time and are grouped into the current primary or create a new one
- Auto-scrolls to latest unless the user is scrolling through history

- **Trigger badges**: `click` `navigation` `error` `page-load` `background`
- **Keyframe indicator**: ◆ diamond marker on keyframe snapshots (which have full DOM + screenshot)

#### Element Picker

Between the textarea and the Report Bug button, an optional **Pick Element** row lets users associate a specific DOM element with the bug.

- Click the **🎯 Pick Element** button → overlay enters a temporary pick mode (same crosshair cursor / highlight behavior as Select mode)
- User clicks any element on the page → overlay sends `BUG_REPORT_ELEMENT_PICKED` via WS with the element's tag, id, classes, CSS selector path, closest React component name (if available), and a bounding-box screenshot
- Panel exits pick mode automatically and displays the picked element in a compact chip: `<button.submit-btn>` with a ✕ to clear
- Only one element at a time (clicking Pick again replaces the previous)
- Element association is **optional** — users can submit bug reports without one
- When the overlay is in pick mode, a "Click an element" hint replaces the element chip
- Pick mode cancels if the user presses Escape or clicks the Pick button again

The picked element gives the agent a specific starting point in the DOM to investigate.

#### Report Submission

- The description textarea **auto-grows** as the user types (min 48px, max 140px). This pushes the top of the form area upward, shrinking the visible event timeline. Scrolls internally once max height is reached.
- "Report Bug" button is disabled until ≥1 primary event is selected AND textarea has content (element pick is optional).
- On click: fetches full range data from overlay via WS → creates a `bug-report` patch → stages it in the queue.
- After staging: success toast, selection resets.
- The patch appears in the existing PatchPopover (draft section) with a 🐛 icon.

---

## Architecture

### Always-On Recording (Overlay)

Recording starts automatically when the overlay initializes. It runs silently in the background regardless of which panel mode is active.

#### Snapshot Triggers

| Trigger | When | Screenshot? | DOM? |
|---------|------|-------------|------|
| **MutationObserver** | DOM changes (debounced 500ms) | Only on keyframes | Full or diff |
| **Click** | User clicks any element | Yes | Merged with mutation if within same 500ms window |
| **Error** | `window.onerror` / `unhandledrejection` | Yes | Full or diff |
| **Navigation** | pushState / replaceState / popstate / beforeunload | Yes (SPA only) | Full (always keyframe) |
| **Page load** | `startRecording()` call | Yes | Full (always keyframe) |

- **MutationObserver** is the primary trigger. Observes `document.body` with `{ subtree: true, childList: true, attributes: true, characterData: true }`.
- VyBit's own shadow DOM (`#tw-visual-editor-host`) mutations are excluded.
- Scroll and input events do NOT trigger snapshots — MutationObserver catches their DOM effects.

#### Adaptive Keyframe/Diff Compression

Uses `jsdiff` (~6KB) to produce unified string diffs between consecutive `document.documentElement.outerHTML` snapshots.

- If diff size > 50% of full DOM size → **auto-promote to keyframe** (store full DOM + screenshot)
- Otherwise → store only the diff (no full screenshot, just a thumbnail)
- Page-load is always a keyframe
- This adapts to page volatility: small class changes produce tiny diffs, full page navigations auto-promote

#### Console Interceptor

- Monkey-patches `console.log`, `console.warn`, `console.error`, `console.info`
- Captures `window.onerror` and `window.addEventListener('unhandledrejection', ...)`
- In-memory buffer (200 entry cap), flushed into each snapshot
- Safe serialization: depth limit 3, 500 chars per arg, circular ref handling

#### Navigation Interceptor

Captures page changes — both SPA-style and traditional full-page navigations.

**SPA navigations (pushState / replaceState / popstate)**:
- Monkey-patches `history.pushState` and `history.replaceState` to intercept before they execute
- Listens for `popstate` (browser back/forward)
- On interception: records a **keyframe snapshot** (full DOM + screenshot) with `trigger: 'navigation'`
- Captures `{ from: prevURL, to: newURL, method: 'pushState' | 'replaceState' | 'popstate' }` in the snapshot metadata
- The subsequent MutationObserver callback (from DOM changes after navigation) is suppressed/merged into the navigation snapshot to avoid duplicates
- The keyframe captures the DOM state *after* the route change settles (waits one `requestAnimationFrame` tick for React to render)

**Traditional full-page navigations**:
- Listens for `beforeunload` and `pagehide` events
- On interception: records a **pre-navigation keyframe** with `trigger: 'navigation'` and `{ from: currentURL, to: null, method: 'full-page' }`
- `to: null` because the destination is unknown at `beforeunload` time — the *next* page-load snapshot captures the landing URL
- Flushes in-memory console and network buffers into the snapshot
- **IndexedDB write must be synchronous-enough**: uses `navigator.sendBeacon()` as a fallback if IndexedDB write is too slow during unload. Alternatively, write to `sessionStorage` as an emergency buffer that the next page load checks and imports.
- The `page-load` snapshot on the new page implicitly pairs with the `navigation` (full-page) snapshot from the previous page, giving the agent a before/after view

**Overlay script re-injection on traditional navigations**:
- The overlay `<script>` tag is in the page HTML (injected by Vite plugin or Storybook decorator), so it re-runs on every full page load
- `startRecording()` checks IndexedDB for existing snapshots and resumes the rolling buffer — no data loss
- In-memory console/network buffers start fresh (acceptable — the pre-navigation snapshot already flushed them)

#### Network Error Interceptor

- Wraps `window.fetch` to capture non-ok responses and thrown errors
- Filters out requests to VyBit's own server origin (avoid noise)
- In-memory buffer (100 entry cap), flushed into each snapshot

#### IndexedDB Storage

- DB: `vybit-recording`, store: `snapshots`
- **100-snapshot rolling buffer** — oldest pruned on insert
- **Keyframe promotion on prune**: when pruning a keyframe, reconstruct the full DOM for the next diff snapshot in the chain and promote it to keyframe (ensures reconstruction chain stays intact)
- DOM reconstruction: walk backward through diffs to nearest keyframe, apply patches forward via `jsdiff`

### Data Flow: Panel ↔ Overlay

Panel accesses recording data via WS request/response (avoids cross-origin IndexedDB issues):

```
Panel                    Server (relay)           Overlay
  │                          │                       │
  │ RECORDING_GET_HISTORY →  │  →                    │
  │                          │  ← RECORDING_HISTORY  │  (array of SnapshotMeta)
  │                          │                       │
  │ RECORDING_GET_SNAPSHOT → │  →                    │
  │                          │  ← RECORDING_SNAPSHOT │  (full data, DOM reconstructed)
  │                          │                       │
  │ RECORDING_GET_RANGE →    │  →                    │
  │                          │  ← RECORDING_RANGE    │  (full snapshots for range)
  │                          │                       │
  │         ← RECORDING_SNAPSHOT_META ←              │  (live push on new snapshot)
  │                          │                       │
  │ BUG_REPORT_PICK_ELEMENT →│  →                    │  (enter pick mode)
  │                          │  ← PICK_MODE_ENTERED  │  (overlay confirms)
  │                          │                       │
  │      ← BUG_REPORT_ELEMENT_PICKED ←               │  (user clicked element)
  │      ← BUG_REPORT_PICK_CANCELLED ←               │  (user pressed Escape)
```

Server passes through without storing.

The overlay reuses the existing element-highlight hover logic from Select mode, but instead of sending `ELEMENT_SELECTED` it sends `BUG_REPORT_ELEMENT_PICKED` with the `BugReportElement` payload. Pick mode is a transient state — it ends on pick or cancel.

### Bug Report Patch Kind

New `PatchKind = 'bug-report'`. Patch fields:

| Field | Type | Description |
|-------|------|-------------|
| `bugDescription` | `string` | User-entered description of what went wrong |
| `bugScreenshots` | `string[]` | JPEG data URLs from selected snapshots (cap at 5 for MCP) |
| `bugTimeline` | `BugTimelineEntry[]` | Chronological events: each entry has timestamp, trigger, url, and optional consoleLogs, networkErrors, domSnapshot, domDiff, hasScreenshot, elementInfo, navigationInfo |
| `bugTimeRange` | `{ start: string; end: string }` | ISO timestamps |
| `bugElement` | `BugReportElement \| null` | User-picked element (optional) |

#### MCP Delivery

The existing `implement_next_change` tool handles `bug-report` patches. The `buildCommitInstructions()` function gets a new branch:

- Includes: title, description, time range, formatted console errors with stack traces, network errors
- Includes: full DOM at start state and end state, plus intermediate diffs
- Attaches: up to 5 screenshots as `{ type: 'image' }` content parts
- If a target element is attached: includes its CSS selector path, component name, outerHTML excerpt, and bounding-box screenshot
- Instructions: "Examine the DOM snapshots, console errors, and screenshots. Identify the root cause. Implement a fix." If an element is attached: "The user identified this element as related to the bug: `<selector>`. Start your investigation there."
- DOM truncated at 50KB per snapshot for token budget (with `<!-- TRUNCATED -->` marker)

#### Queue Behavior

- Bug-report patches always append (no dedup — each bug report is unique)
- No special dedup logic needed

---

## Types

```ts
// Recording types (shared/types.ts)

interface RecordingSnapshot {
  id?: number;
  timestamp: string;
  trigger: 'mutation' | 'click' | 'error' | 'network-error' | 'navigation' | 'page-load';
  isKeyframe: boolean;
  domSnapshot?: string;    // full outerHTML (keyframes only)
  domDiff?: string;        // unified diff (non-keyframes only)
  screenshot?: string;     // JPEG data URL (keyframes + click/error)
  thumbnail?: string;      // 200px JPEG (always present)
  consoleLogs: ConsoleEntry[];
  networkErrors: NetworkError[];
  url: string;
  scrollPosition: { x: number; y: number };
  viewportSize: { width: number; height: number };
  elementInfo?: { tag: string; classes: string; id?: string; innerText?: string };
  pickedElement?: BugReportElement;  // only on BUG_REPORT_ELEMENT_PICKED responses
  navigationInfo?: {
    from: string;
    to: string | null;  // null for full-page navigations (destination unknown at beforeunload)
    method: 'pushState' | 'replaceState' | 'popstate' | 'full-page';
  };
}

interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  args: string[];
  timestamp: string;
  stack?: string;
}

interface NetworkError {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  errorMessage?: string;
  timestamp: string;
}

interface BugReportElement {
  tag: string;
  id?: string;
  classes: string;
  selectorPath: string;        // e.g. "main > div.card-list > button.submit-btn"
  componentName?: string;      // closest React fiber displayName / name, if found
  outerHTML: string;           // element's outerHTML (truncated at 10KB)
  boundingBox: { x: number; y: number; width: number; height: number };
  screenshot?: string;         // JPEG of element bounding box area
}

interface SnapshotMeta {
  id: number;
  timestamp: string;
  trigger: RecordingSnapshot['trigger'];
  isKeyframe: boolean;
  thumbnail?: string;
  elementInfo?: RecordingSnapshot['elementInfo'];
  consoleErrorCount: number;
  networkErrorCount: number;
}
```

---

## Files

### New Files

| File | Description |
|------|-------------|
| `overlay/src/recording/index.ts` | Recording engine orchestrator — startRecording/stopRecording |
| `overlay/src/recording/snapshot-store.ts` | IndexedDB read/write/prune with keyframe promotion |
| `overlay/src/recording/dom-differ.ts` | DOM serialization + jsdiff-based adaptive diffing |
| `overlay/src/recording/console-interceptor.ts` | Console monkey-patching + buffer |
| `overlay/src/recording/network-interceptor.ts` | Fetch wrapping + buffer |
| `overlay/src/recording/event-capture.ts` | MutationObserver + click/error listeners |
| `overlay/src/recording/navigation-interceptor.ts` | pushState/replaceState monkey-patching, popstate + beforeunload listeners |
| `panel/src/components/BugReportMode/index.ts` | Re-exports |
| `panel/src/components/BugReportMode/BugReportMode.tsx` | Main Bug Report mode component |
| `panel/src/components/BugReportMode/types.ts` | Local types |

### Modified Files

| File | Change |
|------|--------|
| `shared/types.ts` | Add RecordingSnapshot, ConsoleEntry, NetworkError, SnapshotMeta, bug-report PatchKind + fields, WS message types, AppMode update |
| `overlay/src/index.ts` | Call `startRecording()` after WS connection |
| `panel/src/App.tsx` | Add `'bug-report'` mode, landing CTA card, route to BugReportMode |
| `panel/src/components/ModeToggle/ModeToggle.tsx` | Icon-only buttons + third Bug Report button |
| `panel/src/components/PatchPopover/PatchPopover.tsx` | Render bug-report patches with 🐛 icon |
| `server/queue.ts` | No-dedup for bug-report patches |
| `server/mcp-tools.ts` | buildCommitInstructions() branch for bug-report + image parts |
| `package.json` | Add `jsdiff` dependency |

---

## Performance

- **MutationObserver callback**: <5ms (just schedules debounced handler)
- **Screenshot capture**: runs in `requestIdleCallback`, skipped if previous is in-flight
- **DOM serialization**: synchronous `outerHTML` read (~1-5ms for typical pages)
- **Diffing**: runs in microtask after serialization
- **IndexedDB writes**: async, non-blocking
- **Bundle impact**: `jsdiff` ~6KB minified, recording modules ~15-20KB total

## Future Enhancements

1. **DOM subtree selection** — let users click on the DOM tree in an expanded snapshot to narrow scope before submitting
2. **`get_dom_section` MCP tool** — agent requests specific DOM subtrees by CSS selector (reduces token usage)
3. **Video replay** — keyframe+diff architecture enables sequential DOM state reconstruction in a sandboxed iframe
4. **`investigate_bug` MCP tool** — separate from `implement_next_change` if agent behavior diverges for bugs vs. changes
5. **Compression** — use browser's `CompressionStream` API if jsdiff bundle becomes a concern
