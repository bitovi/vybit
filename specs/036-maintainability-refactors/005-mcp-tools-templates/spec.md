# 036-005 — MCP Tools Template Extraction

## Problem

`server/mcp-tools.ts` is 595 lines. The core issue is `buildCommitInstructions()` at ~200 lines — a single function that generates a markdown prompt by concatenating strings with deeply nested conditionals for each patch kind (class-change, text-change, message, design, component-drop, bug-report).

### Specific Smells

1. **`buildCommitInstructions()`** — handles 6 patch kinds with per-kind markdown templates, a step-instruction builder, and a results-part builder. Each patch kind has its own 15–40 line template with inline string concatenation, ternary expressions, and IIFEs (e.g., the bug-report timeline is a 50-line IIFE).

2. **`buildJsx()`** — 15 lines of string manipulation building JSX from component args. No escaping of special characters in prop values. Fragile to edge cases (nested objects, arrays).

3. **Per-kind results-part building** — 5 separate `.map().join()` calls to build the same `{ "patchId": "...", "success": true }` structure, then joined with `.filter(Boolean).join()`. This is the same pattern repeated 5 times.

4. **Step instruction builder** — ~25 lines of conditionally accumulated numbered steps. The step numbers are computed with `stepInstructions.length + 1` which is error-prone if ordering changes.

5. **Bug-report timeline rendering** — 50+ lines of inline timeline formatting with nested conditionals for console logs, network errors, DOM changes, and screenshots. This is a rendering concern embedded in a tool-registration file.

## Proposed Changes

### Phase 1: Extract Per-Kind Patch Renderers

Create a renderer for each patch kind that takes a patch and returns its markdown section:

**New file:** `server/prompt/patch-renderers.ts`

```typescript
export function renderClassChange(patch: Patch, stepNum: number): string;
export function renderTextChange(patch: Patch, stepNum: number): string;
export function renderMessage(patch: Patch, stepNum: number): string;
export function renderDesign(patch: Patch, stepNum: number): string;
export function renderComponentDrop(patch: Patch, stepNum: number, patchStepMap: Map<string, number>): string;
export function renderBugReport(patch: Patch, stepNum: number): string;
```

Each renderer is 15–40 lines of focused markdown generation.

The existing `buildCommitInstructions()` becomes:

```typescript
function buildCommitInstructions(commit: Commit, remainingCount: number): string {
  const patchStepMap = buildPatchStepMap(commit.patches);
  const renderers: Record<string, PatchRenderer> = {
    'class-change': renderClassChange,
    'text-change': renderTextChange,
    'message': renderMessage,
    'design': renderDesign,
    'component-drop': renderComponentDrop,
    'bug-report': renderBugReport,
  };
  
  let patchList = '';
  let stepNum = 1;
  for (const patch of commit.patches) {
    const renderer = renderers[patch.kind ?? 'class-change'];
    patchList += renderer(patch, stepNum, patchStepMap);
    stepNum++;
  }
  
  return buildFullPrompt(commit, patchList, remainingCount);
}
```

### Phase 2: Extract Bug Report Timeline Renderer

The bug-report renderer has an embedded 50-line timeline formatter. Extract it:

**New file:** `server/prompt/timeline-renderer.ts`

```typescript
export function renderTimeline(entries: BugTimelineEntry[]): string;
export function renderTimelineEntry(entry: BugTimelineEntry, index: number): string;
```

This separates the DOM-diff, console-log, network-error, and screenshot formatting into testable functions.

### Phase 3: Consolidate Results Builder

Replace the 5 separate `.map().join()` calls with a single function:

```typescript
function buildResultsJson(patches: Patch[]): string {
  return patches
    .filter(p => p.kind !== 'message')  // messages are informational
    .map(p => `     { "patchId": "${p.id}", "success": true }`)
    .join(',\n');
}
```

### Phase 4: Extract Step Instructions Builder

```typescript
function buildStepInstructions(commit: Commit): string[] {
  const steps: string[] = [];
  const kinds = new Set(commit.patches.map(p => p.kind));
  
  if (kinds.has('class-change') || kinds.has('component-drop') || kinds.has('text-change')) {
    steps.push(buildImplementStep(kinds));
  }
  if (kinds.has('design')) {
    steps.push(buildDesignStep(commit));
  }
  if (kinds.has('bug-report')) {
    steps.push(buildBugReportStep(commit));
  }
  
  return steps.map((text, i) => `${i + 1}. ${text}`);
}
```

## File Impact

| File | Change |
|------|--------|
| `server/mcp-tools.ts` | Shrinks from ~595 to ~350 lines (tool registration + waitForCommitted + simplified buildCommitInstructions) |
| `server/prompt/patch-renderers.ts` | New (~150 lines) |
| `server/prompt/timeline-renderer.ts` | New (~60 lines) |

## Testing Strategy

1. **Patch renderers** — unit test each renderer with a fixture patch: verify markdown output contains expected fields, class names, context HTML
2. **Timeline renderer** — unit test with fixture timeline entries: verify console logs, network errors, DOM changes, screenshots are all formatted correctly
3. **Results builder** — verify `buildResultsJson` filters messages, produces valid JSON-like structure
4. **`buildCommitInstructions` integration** — test with a full commit containing mixed patch kinds; verify output matches expected markdown snapshot
5. **E2E:** commit a class-change and a message via the panel, call `implement_next_change` via mock MCP client, verify the returned instructions contain both changes with correct formatting

## Out of Scope

- Parameterizing prompts for different AI models (future work)
- Adding a template engine (ejs, handlebars) — the string concatenation is fine for this scale once decomposed
- Changing MCP tool signatures or behaviors
- Refactoring `waitForCommitted()` (already reasonably self-contained)
- Adding Zod validation to WebSocket messages (cross-cutting concern in overview)
