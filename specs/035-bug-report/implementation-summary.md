# 035 — Bug Report: Implementation Summary

## What Was Built

All **non-visual recording modules** from the spec are implemented and tested. These are the overlay-side subsystems that silently capture browser activity in the background — the data layer that the future Bug Report panel UI will consume.

## Module Inventory

All modules live under `overlay/src/recording/`, each in its own modlet-style folder.

### 1. Console Interceptor (`console-interceptor/`)

- **API:** `createConsoleInterceptor() → ConsoleInterceptorHandle`
- **Handle:** `{ flush(), peek(), size(), teardown() }`
- Monkey-patches `console.log`, `.warn`, `.error`, `.info`
- Captures `window.onerror` and `unhandledrejection` events
- 200-entry rolling buffer, flushed into each snapshot
- `safeSerialize()` utility: depth limit 3, 500 chars per arg, circular reference handling
- `teardown()` restores original console methods and removes error listeners
- **Tests:** 20 (14 interceptor + 6 safeSerialize)

### 2. Network Interceptor (`network-interceptor/`)

- **API:** `createNetworkInterceptor({ serverOrigin? }) → NetworkInterceptorHandle`
- **Handle:** `{ flush(), peek(), size(), teardown() }`
- Wraps `window.fetch` to capture non-ok responses (4xx/5xx) and thrown errors
- Filters out requests to VyBit's own server origin (avoids noise)
- 100-entry rolling buffer
- `teardown()` restores original `window.fetch`
- **Tests:** 12

### 3. Navigation Interceptor (`navigation-interceptor/`)

- **API:** `createNavigationInterceptor(callback) → () => void` (pure teardown function)
- No buffer — fires callback directly with `NavigationInfo`
- Patches `history.pushState` and `history.replaceState`
- Listens for `popstate` (back/forward) and `beforeunload` (full-page nav)
- Captures `{ from, to, method }` metadata
- `teardown()` restores original history methods and removes event listeners
- **Tests:** 6

### 4. Event Capture (`event-capture/`)

- **API:** `createEventCapture(onSnapshot) → EventCaptureHandle`
- **Handle:** `{ suppressNext(), teardown() }`
- MutationObserver on `document.body` (subtree, childList, attributes, characterData)
- Click and error event listeners on `document` / `window`
- 500ms debounce on mutation snapshots
- Excludes VyBit's own shadow DOM host mutations
- `suppressNext()` skips one mutation callback (used by RecordingEngine after navigations)
- **Tests:** 9

### 5. DOM Differ (`dom-differ/`)

- **API:** `new DomDiffer()` (class — stateful baseline tracking)
- Methods: `computeDiff(dom, forceKeyframe?)`, `reset()`, `setBaseline(dom)`
- Static: `DomDiffer.reconstructDom(base, diffs[])` — walks diff chain forward from keyframe
- Uses `jsdiff` (`~6KB`) for unified string diffs
- Adaptive keyframe promotion: diff > 50% of full DOM AND DOM > 500 bytes → auto-keyframe
- Page-load and navigation always force keyframe
- **Tests:** 11

### 6. Snapshot Store (`snapshot-store/`)

- **API:** `new SnapshotStore()` (class — async open/close lifecycle)
- Methods: `open()`, `close()`, `addSnapshot()`, `getSnapshot()`, `getAllSnapshots()`, `getSnapshotMetas()`, `getRange()`, `clear()`
- IndexedDB database: `vybit-recording`, object store: `snapshots`
- 100-snapshot rolling buffer — oldest pruned on insert
- Keyframe promotion on prune: when pruning a keyframe, reconstructs full DOM for next diff snapshot and promotes it (keeps reconstruction chain intact)
- **Tests:** 9

### 7. Recording Engine (`recording-engine.ts`)

- **API:** `new RecordingEngine(options?) → { startRecording(), stopRecording(), getHistory(), getSnapshot(), getRange() }`
- Orchestrator that wires all modules together
- `startRecording()`: opens IndexedDB, creates all interceptor handles, captures initial page-load keyframe
- `stopRecording()`: calls `teardown()` on all handles, closes IndexedDB
- Resumes from existing IndexedDB snapshots (finds last keyframe for differ baseline)
- Suppresses duplicate mutation after navigation events
- `onNewSnapshot` callback for live-pushing `SnapshotMeta` to the panel
- **Tests:** covered indirectly via module tests

## Shared Types Added (`shared/types.ts`)

| Type | Purpose |
|------|---------|
| `ConsoleEntry` | `{ level, args, timestamp }` |
| `NetworkError` | `{ url, method, status, statusText, body?, error?, timestamp }` |
| `BugReportElement` | Picked element info (tag, id, classes, selector, component name, screenshot) |
| `SnapshotTrigger` | `'mutation' \| 'click' \| 'error' \| 'navigation' \| 'page-load'` |
| `NavigationInfo` | `{ from, to, method }` |
| `RecordingSnapshot` | Full snapshot record (DOM, console, network, scroll, viewport, etc.) |
| `SnapshotMeta` | Lightweight timeline entry (id, timestamp, trigger, counts) |

`PatchKind` was extended with `'bug-report'`.

## Dependencies Added

| Package | Type | Purpose |
|---------|------|---------|
| `diff` (jsdiff) | runtime | Unified string diffs for DOM compression |
| `@types/diff` | dev | TypeScript definitions for jsdiff |
| `fake-indexeddb` | dev | IndexedDB shim for Vitest/Node tests |

## Test Summary

- **67 tests** across 6 test files, all passing
- **327 total project tests** passing (no regressions)

## Design Pattern

All interceptors use a **functional factory** pattern:

```ts
// Buffer-based (console, network)
const handle = createXInterceptor(options?)
handle.flush()    // drain buffer
handle.peek()     // read without draining
handle.size()     // current count
handle.teardown() // restore originals, stop capturing

// Callback-based (navigation)
const teardown = createNavigationInterceptor(callback)
teardown()  // restore originals, stop capturing

// Callback + control (event capture)
const handle = createEventCapture(onSnapshot)
handle.suppressNext()  // skip next mutation
handle.teardown()      // disconnect observer, remove listeners
```

`DomDiffer` and `SnapshotStore` remain classes (stateful lifecycle where class pattern fits naturally).

## What's Not Yet Built

Per the spec, these are the remaining pieces (all visual/panel/server-side):

- **Bug Report panel UI** — mode toggle, grouped timeline, checkboxes, textarea, element picker
- **WS message types** — `RECORDING_GET_HISTORY`, `RECORDING_GET_SNAPSHOT`, `RECORDING_GET_RANGE`, `RECORDING_SNAPSHOT_META`, `BUG_REPORT_PICK_ELEMENT`, `BUG_REPORT_ELEMENT_PICKED`
- **Bug report patch creation** — assembling selected snapshots into a `bug-report` patch
- **Screenshot capture** — `html2canvas` or Canvas API integration for viewport thumbnails
- **Server relay** — pass-through WS routing for recording messages
- **MCP tool updates** — `implement_next_change` handling for `bug-report` patch kind
