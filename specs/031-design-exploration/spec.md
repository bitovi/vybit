# 031 — Design Exploration

## Problem

Users can visually tweak existing Tailwind classes on a running app, but they can't explore *new* design ideas. If someone selects a `<div>` and thinks "this should be a file uploader," there's no way to say that, see options, and iterate toward a solution — they'd have to leave VyBit entirely, describe the idea to an agent in a separate tool, review code diffs, and hope it looks right.

The same gap exists at page scale: a user might draw a full dashboard layout on the canvas with many components and annotations, then want to say "give me variations of this" — and there's no way to go from canvas sketch to live rendered alternatives and back.

The gap is: **VyBit edits what exists, but can't help you explore what could exist.**

## Goal

Let users describe what they want (via text prompt, canvas sketch, or both), have an AI agent generate multiple design options as real Storybook stories, browse those options in a full-body iframe, directly edit a chosen option on the Fabric canvas, and iterate through unlimited rounds — all within the VyBit workflow. The story code serves as the implementation draft.

---

## User Story

### Path A: Text prompt (element selected)

1. **Select** an element on the page.
2. **Describe** what they want: *"show me what a file uploader could look like here"*.
3. **Wait** while the agent writes 2–5 Storybook stories as design options.
4. **Browse** options in the iframe (prev/next to switch).
5. **Pick**, **refine** (text feedback), or **edit** (load into Fabric canvas) — unlimited rounds.
6. **Implement** — agent uses the chosen story's code as the implementation draft.
7. **Cleanup** — temp story files are deleted automatically.

### Path B: Canvas sketch (draw first)

1. **Open** the Fabric design canvas (draw button or blank canvas).
2. **Draw** a layout: place components, add text, sketch shapes, annotate.
3. **Type** a prompt: *"give me variations of this dashboard"*.
4. **Click** "Explore Variations."
5. **Wait** while the agent writes stories based on the sketch + prompt.
6. **Browse** → **Edit** → **Refine** → **Browse** (same loop as Path A).
7. **Implement** when satisfied.

### The Loop

Both paths converge on the same iteration cycle:

```
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  ▼                                                      │
CREATE (Canvas)                                          │
  Draw, place components, annotate                       │
  + text prompt                                          │
  [Explore Variations]                                   │
  │                                                      │
  ▼                                                      │
GENERATE                                                 │
  Agent writes 2-5 Storybook stories                     │
  │                                                      │
  ▼                                                      │
BROWSE (Iframe)                                          │
  Full-body story preview                                │
  ◀ Prev   "Option 2 of 3: Compact grid"   Next ▶       │
  │                                                      │
  ├── [Use this] ──→ IMPLEMENT ──→ done                  │
  │                                                      │
  ├── [Refine: "make it darker"] ──→ GENERATE ──→ BROWSE │
  │                                                      │
  ├── [Edit this] ──→ Decompose story DOM into Fabric ───┘
  │                    (spec 032)
  │                    User drags, resizes, edits text,
  │                    draws annotations
  │                    [Explore Variations] → GENERATE
  │                    [Use this as-is] → IMPLEMENT
  │
  └── [Cancel] ──→ cleanup ──→ done
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mockup format | **Real Storybook stories** | The mockup IS code. No ghost-HTML-to-code translation. Story file = implementation draft. |
| Option rendering | **Full-body iframe** | Story renders in the iframe at full body. Prev/next buttons to switch between options. Works at any scale — element, section, or full page. |
| Direct editing | **Fabric canvas via spec 032** | "Edit this" decomposes the story's rendered DOM into individual Fabric objects (spec 032's `decomposeSubtree` + `rasterizeElements`). User drags, resizes, edits text, annotates. Visual-only — Fabric layer, not DOM mutations. |
| Iteration model | **Unlimited rounds** | Fabric → Agent → Story → Fabric → ... → Implement. Each round the agent gets richer context. |
| Refinement modes | **Three parallel paths** | Chat ("Refine..."), direct manipulation ("Edit this" → canvas), or accept ("Use this"). User picks the right tool for the change. |
| Option count | **Agent decides (2–5)** | Based on prompt complexity. User can override ("show me 4 options"). |
| Story structure | **One story per file** | `Option1.stories.tsx`, `Option2.stories.tsx`, etc. Clean for cleanup and agent reasoning. |
| Temp directory | **`src/__vybit_explore__/{taskId}/`** | Under target project root. `.gitignore`d. Deleted after implementation or cancellation. |
| Storybook availability | **Reuse `StorybookConnect` warning** | Same pattern as Components tab — detect via `/api/storybook-data`. |
| Agent guidance | **Skill file** | `.github/skills/explore-design/SKILL.md` — projects customize component preferences, layout conventions, theming. |

---

## Architecture

### How It Fits the Existing System

The current agent loop is: `implement_next_change` → wait for committed change → return instructions → agent implements → `mark_change_implemented` → loop.

Design exploration generalizes this from "implement changes" to "execute tasks." The `implement_next_change` tool becomes the universal entry point — it returns different instruction types depending on what's next in the queue:

```
                          ┌─────────────────────────┐
                          │  implement_next_change   │
                          │  (universal entry point) │
                          └────────┬────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐  ┌───────────┐  ┌───────────┐
              │ Commit   │  │ explore_  │  │ refine_   │
              │ (existing│  │ design    │  │ design    │
              │ impl)    │  │ task      │  │ task      │
              └──────────┘  └───────────┘  └───────────┘
                    │              │              │
                    ▼              ▼              ▼
              buildCommit     buildExplore    buildRefine
              Instructions    Instructions    Instructions
```

Tasks have priority over commits in the queue. Commits continue to work exactly as before (backward compatible).

### End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ USER                                                            │
│                                                                 │
│  Path A: Select element → type prompt → "Explore Designs"       │
│  Path B: Open canvas → draw layout → type prompt →              │
│          "Explore Variations"                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
        [WS: EXPLORE_DESIGN { prompt, elementContext,             ]
        [     image?, decomposedElements?, canvasComponents? }    ]
                     │
                     ▼
           ┌─────────────────────┐
           │  server/queue.ts    │
           │  addTask({          │
           │    type: 'explore_  │
           │    design',         │
           │    status: 'pending'│
           │  })                 │
           └────────┬────────────┘
                    │
      [implement_next_change unblocks]
                    │
                    ▼
           ┌──────────────────────────────────────────┐
           │  AI Agent                                 │
           │                                           │
           │  Receives: buildExploreInstructions()     │
           │  - User prompt                            │
           │  - Element context (HTML, component name) │
           │  - Canvas image + component positions     │
           │    (if from canvas path)                   │
           │  - Design system inventory                │
           │  - Story file template                    │
           │                                           │
           │  Agent writes:                            │
           │    src/__vybit_explore__/{taskId}/         │
           │      Option1.stories.tsx                   │
           │      Option2.stories.tsx                   │
           │      Option3.stories.tsx                   │
           │                                           │
           │  Calls: submit_design_options({           │
           │    taskId, options: [...]                  │
           │  })                                       │
           └────────┬─────────────────────────────────┘
                    │
      [DESIGN_OPTIONS_READY broadcast to overlay + panel]
                    │
                    ▼
           ┌──────────────────────────────────────────┐
           │  Overlay: Iframe Preview Mode             │
           │                                           │
           │  Iframe shows full-body rendered story     │
           │                                           │
           │  ◀ Prev    Option 2 of 3    Next ▶        │
           │  "Compact grid layout"                    │
           │                                           │
           │  [Use this] [Edit this] [Refine: ___] [✕] │
           └──────────────────────┬───────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        "Use this"          "Edit this"         "Refine..."
              │                   │                   │
              ▼                   ▼                   ▼
        IMPLEMENT           EDIT ON CANVAS       AGENT REVISES
        Agent uses          Decompose story      Agent updates
        story code →        DOM → Fabric         stories →
        real component      (spec 032)           new options →
              │             User manipulates      back to BROWSE
              ▼             [Explore Variations]
        Cleanup                   │
        temp stories              ▼
                            EXPLORE AGAIN
                            Screenshot + positions
                            → agent writes stories
                            → back to BROWSE
```

---

## Entry Points

### Path A: Text prompt from panel

When an element is selected, an "Explore" section appears in the panel below the class chips:

```
┌─────────────────────────────────┐
│ <Button> "Submit"          [✕]  │
│                                 │
│ ─── Styles ───                  │
│ [px-4] [py-2] [bg-blue-500]... │
│                                 │
│ ─── Explore ───                 │
│ [ What should this look like? ] │
│ [        Explore Designs    🔍] │
└─────────────────────────────────┘
```

Sends `EXPLORE_DESIGN` with the element context (component name, classes, surrounding HTML) and the text prompt. No canvas image.

### Path B: Canvas sketch → explore

After drawing on the existing Fabric design canvas, a new "Explore Variations" button appears alongside the existing "Submit Design":

```
┌─────────────────────────────────────────┐
│  [Canvas with drawn layout / components] │
│                                          │
│  [ What should this look like? ________] │
│                                          │
│  [Submit Design]  [Explore Variations 🔍]│
└──────────────────────────────────────────┘
```

- **Submit Design** (existing) — sends canvas as a `design` patch for immediate implementation.
- **Explore Variations** (new) — sends canvas image + placed component metadata + prompt text as an `explore_design` task. Agent generates multiple story variations inspired by the sketch.

The `EXPLORE_DESIGN` message includes the canvas image (base64 PNG) and `canvasComponents` array (same structure as existing `DESIGN_SUBMIT`) when originating from the canvas path.

### Path C: "Edit this" → back to canvas → explore again

After browsing generated options, user clicks "Edit this" on a story option:

1. Story iframe renders the full design.
2. Overlay calls `decomposeSubtree()` (spec 032) on the story's rendered root element.
3. Elements are rasterized to individual PNGs.
4. Fabric canvas opens with each element as a draggable/resizable object (spec 032 flow).
5. User manipulates the layout, edits text, draws annotations.
6. Clicks "Explore Variations" → same as Path B, but with the modified canvas.
7. Or clicks "Use this as-is" → implementation from the visual reference (screenshot + element positions).

This is the key loop: **Story → Fabric → Story → Fabric → ... → Implement.**

---

## Browsing: Iframe Preview Mode

When options are ready, the overlay enters **iframe preview mode**. This is NOT a small overlay carousel — the story renders at full body in the iframe.

### Rendering

- The existing design canvas wrapper iframe is repurposed (or a new full-body iframe is injected).
- Iframe `src` is set to the Storybook story URL: `/storybook/iframe.html?id={storyId}&viewMode=story`.
- One iframe, re-pointed on prev/next (not multiple simultaneous iframes).
- Story renders at its natural size — works for small components, sections, or full pages.

### Controls

Controls are rendered in the overlay's shadow DOM, positioned as a bottom bar or floating toolbar:

```
┌────────────────────────────────────────────────────────────┐
│ ◀ Prev    Option 2 of 3: "Compact grid layout"    Next ▶  │
│                                                            │
│ [Use this]  [Edit this]  [Refine: ________________]  [✕]  │
└────────────────────────────────────────────────────────────┘
```

- **◀ Prev / Next ▶** — switches iframe `src` to the prev/next story URL. Shows loading indicator while story renders.
- **Option N of M + title** — current option label.
- **"Use this"** — sends `DESIGN_OPTION_SELECTED { taskId, optionIndex }`. Exits preview mode.
- **"Edit this"** — triggers spec 032 decomposition of the current story's rendered DOM → opens Fabric canvas. Exits preview mode.
- **"Refine: [______]"** — inline text input. Submit sends `DESIGN_OPTION_REFINE { taskId, optionIndex, feedback }`. Shows "Refining..." indicator while agent works. New options replace current set when ready.
- **"✕"** — cancel exploration, dismiss preview, cleanup.
- **Keyboard:** ←/→ navigate, Enter selects "Use this", Escape cancels, Tab cycles controls.

### Loading States

- **Switching options:** Iframe shows loading spinner while new story renders. The `adaptive-iframe` pattern (MutationObserver waiting for `#storybook-root` to populate) detects render completion.
- **Refining:** Controls show "Agent is refining..." with a spinner. Current option remains visible. When new options arrive via `DESIGN_OPTIONS_READY`, iframe is re-pointed to the first new option.

---

## Data Model

### Task Type

```typescript
interface Task {
  id: string;                            // UUID
  type: 'explore_design' | 'refine_design';
  status: 'pending' | 'active' | 'presenting' | 'done' | 'cancelled';
  payload: ExploreDesignPayload | RefineDesignPayload;
  options?: DesignOption[];              // populated by submit_design_options
  createdAt: string;                     // ISO timestamp
}

interface ExploreDesignPayload {
  prompt: string;                        // user's description
  elementContext?: {
    componentName?: string;
    tag: string;
    classes: string;
    innerText: string;
    context: string;                     // HTML snippet for AI context
  };
  image?: string;                        // base64 PNG from canvas (Path B/C)
  canvasComponents?: CanvasComponent[];  // placed components from canvas
  decomposedElements?: Array<{           // element positions from Fabric (Path C)
    selector: string;
    originalRect: { x: number; y: number; width: number; height: number };
    newRect: { x: number; y: number; width: number; height: number };
  }>;
  targetRect?: { top: number; left: number; width: number; height: number };
}

interface RefineDesignPayload {
  previousTaskId: string;                // the explore or prior refine task
  selectedOptionIndex: number;           // which option the user wants refined
  feedback: string;                      // "make it more minimal"
  storyIds: string[];                    // current option storyIds for reference
}

interface DesignOption {
  index: number;                         // 0-based
  title: string;                         // "Clean minimal"
  description: string;                   // brief explanation of the approach
  storyId: string;                       // Storybook story ID for iframe URL
  storyFilePath: string;                 // relative path to temp .stories.tsx file
}
```

### Task Status Lifecycle

```
pending          — user submitted, waiting for agent
    ↓
active           — agent picked up via implement_next_change
    ↓
presenting       — agent called submit_design_options, options visible
    ↓
done             — user selected "Use this" or cancelled
    OR
cancelled        — user dismissed or cancelled
```

### New Message Types

```typescript
// Panel/Canvas → Server: initiate exploration
interface ExploreDesignMessage {
  type: 'EXPLORE_DESIGN';
  prompt: string;
  componentName?: string;
  tag?: string;
  classes?: string;
  innerText?: string;
  context?: string;
  image?: string;                        // base64 PNG (canvas path)
  canvasComponents?: CanvasComponent[];  // placed components (canvas path)
  decomposedElements?: Array<{           // element positions (edit path)
    selector: string;
    originalRect: { x: number; y: number; width: number; height: number };
    newRect: { x: number; y: number; width: number; height: number };
  }>;
}

// Server → Overlay + Panel: agent finished generating options
interface DesignOptionsReadyMessage {
  type: 'DESIGN_OPTIONS_READY';
  taskId: string;
  options: DesignOption[];
}

// Overlay → Server: user picked an option to implement
interface DesignOptionSelectedMessage {
  type: 'DESIGN_OPTION_SELECTED';
  taskId: string;
  optionIndex: number;
}

// Overlay → Server: user wants to refine via chat
interface DesignOptionRefineMessage {
  type: 'DESIGN_OPTION_REFINE';
  taskId: string;
  optionIndex: number;
  feedback: string;
}

// Overlay → Server: user wants to edit option on canvas
interface DesignOptionEditMessage {
  type: 'DESIGN_OPTION_EDIT';
  taskId: string;
  optionIndex: number;
}

// Server → Overlay: dismiss preview mode
interface DesignExplorationCompleteMessage {
  type: 'DESIGN_EXPLORATION_COMPLETE';
  taskId: string;
}
```

---

## MCP Tools

### Modified: `implement_next_change`

The existing tool stays backward-compatible. Internally, it now calls `waitForPendingItem()` instead of `waitForCommitted()`, which resolves on either a committed commit or a pending task (tasks have priority).

Response format is unchanged — `{ isComplete: false, nextAction: "...", ... }` — but the instructions and payload vary by item type.

### New: `submit_design_options`

```
Name:        submit_design_options
Description: Submit design option stories for user review. Call after writing
             all story files for a design exploration task.
Input:
  taskId:    string (required) — the exploration task ID
  options:   array (required) — [{ index, title, description, storyId, storyFilePath }]
Output:
  { success: true, message: "Options presented to user. Call implement_next_change
    to wait for their decision." }
Side effects:
  - Stores options on the task
  - Marks task status → 'presenting'
  - Broadcasts DESIGN_OPTIONS_READY to overlay + panel
```

### New: `get_design_system_inventory`

```
Name:        get_design_system_inventory
Description: Get available components and theme tokens from the project's design
             system. Use before writing exploration stories to understand what
             building blocks are available.
Input:       (none)
Output:
  {
    components: [{ name, storyId, argTypes, variants }],
    theme: { colors, spacing, fontSize, ... }
  }
Sources:
  - Storybook index (/index.json) for component list + variants
  - Ghost cache for argTypes and rendered previews
  - /tailwind-config endpoint for theme tokens
```

---

## Agent Instructions

### `buildExploreInstructions(task)`

Returns markdown instructions sent to the agent when it picks up an `explore_design` task. Content adapts based on what's in the payload:

**If text prompt only (Path A):**
```markdown
# Design Exploration

The user wants to explore design options for an element on their page.

## User's Request
"{task.payload.prompt}"

## Target Element
- **Component:** {componentName}
- **Tag:** <{tag}>
- **Current classes:** `{classes}`
- **Context HTML:**
```html
{context}
```

## Instructions
1. Create 3 design options as separate Storybook story files.
2. Write each to: `src/__vybit_explore__/{taskId}/OptionN.stories.tsx`
   ...
```

**If canvas sketch included (Path B/C):**
```markdown
# Design Exploration

The user sketched a layout and wants variations.

## User's Request
"{task.payload.prompt}"

## Canvas Sketch
(see attached image)

## Components Placed on Canvas
| # | Component | Import | Props | Position | Size |
|---|-----------|--------|-------|----------|------|
| 1 | Button | ./src/components/Button | variant="primary" | (150, 50) | 120×40px |
...

## Element Rearrangements (from edit)
(if decomposedElements present — element position table from spec 032)

## Instructions
1. Use the canvas sketch as visual reference for layout and composition.
2. Create 3 design options as separate Storybook story files.
3. Write each to: `src/__vybit_explore__/{taskId}/OptionN.stories.tsx`
   ...
```

**Common ending for both:**
```markdown
## Story File Template
```tsx
import type { Meta, StoryObj } from '@storybook/react';

const OptionN = () => (
  <div className="...">
    {/* Your design here */}
  </div>
);

const meta: Meta<typeof OptionN> = {
  title: '__vybit_explore__/{taskId}/Option N Title',
  component: OptionN,
};
export default meta;

export const Default: StoryObj<typeof OptionN> = {};
```

After writing all story files, call `submit_design_options` with:
- taskId: "{taskId}"
- options: [{ index: 0, title: "...", description: "...", storyId: "...", storyFilePath: "..." }]

Then call `implement_next_change` to wait for the user's decision.

Do NOT implement the design yet. Only create the story files.
```

### `buildRefineInstructions(task)`

```markdown
# Design Refinement

The user reviewed your design options and wants changes.

## Selected Option
Option {selectedIndex}: "{selectedOption.title}"
Story file: `{selectedOption.storyFilePath}`

## User's Feedback
"{task.payload.feedback}"

## Instructions
1. Revise the story files based on the feedback.
   - You may update the selected option, create new variations, or replace all options.
2. Write updated stories to: `src/__vybit_explore__/{taskId}/`
3. Call `submit_design_options` with the updated option list.
4. Then call `implement_next_change` to wait for the user's next decision.
```

---

## Implementation Plan

### Phase 1: Generalize the Agent Loop

**Goal:** `implement_next_change` serves tasks alongside commits.

#### 1.1 Add types (`shared/types.ts`)

Add `Task`, `ExploreDesignPayload`, `RefineDesignPayload`, `DesignOption`, and all new message types (see Data Model above). Existing types untouched.

#### 1.2 Extend queue (`server/queue.ts`)

- Add `tasks: Task[]` alongside existing `commits[]` and `draftPatches[]`.
- `addTask(task)` — push to array, emit `'task-added'` event.
- `getNextPendingItem()` — returns oldest pending task, or falls back to oldest committed commit. Tasks have priority.
- `waitForPendingItem(getNext, onAdded, extra, broadcast)` — same shape as `waitForCommitted()` but resolves on either a task or a commit arriving. Keepalive + abort support.
- `markTaskActive(taskId)` — status → `'active'`.
- `markTaskPresenting(taskId, options)` — status → `'presenting'`, stores options.
- `markTaskDone(taskId)` — status → `'done'`.
- `cancelTask(taskId)` — status → `'cancelled'`.
- `getTask(taskId)` — lookup by ID.
- Existing commit functions (`commitDraft`, `markCommitImplementing`, etc.) completely unchanged.

#### 1.3 Generalize MCP entry point (`server/mcp-tools.ts`)

- `implement_next_change`: replace `waitForCommitted()` with `waitForPendingItem()`.
  - If result is a `Commit` → existing `buildCommitInstructions()` (zero change to this path).
  - If result is a `Task` with `type: 'explore_design'` → call `markTaskActive()`, return `buildExploreInstructions(task)`.
  - If result is a `Task` with `type: 'refine_design'` → call `markTaskActive()`, return `buildRefineInstructions(task)`.
  - All responses: `isComplete: false`, loop-back directive.
- Add `submit_design_options` tool.
- Add `get_design_system_inventory` tool.
- Add `buildExploreInstructions()` and `buildRefineInstructions()` functions.

### Phase 2: Exploration Entry Points

**Goal:** Users can initiate explorations from the panel AND from the canvas.

#### 2.1 ExplorePrompt component (`panel/src/components/ExplorePrompt/`)

Modlet pattern:
```
panel/src/components/ExplorePrompt/
  index.ts
  ExplorePrompt.tsx
  ExplorePrompt.test.tsx
```

- Text input + "Explore Designs" button.
- Shown in `Picker.tsx` when an element is selected (new section below class chips).
- On submit: sends `EXPLORE_DESIGN` message via `ws.send()` with element context + prompt.
- State: checks `/api/storybook-data` availability. If unavailable, renders `StorybookConnect` component (reuse from DrawTab) instead of the prompt.
- While task is active: shows "Agent is exploring..." spinner with cancel button.
- While presenting: shows "Viewing options..." status.

#### 2.2 "Explore Variations" button in DesignCanvas

- New button in the canvas submit bar, alongside existing "Submit Design."
- On click: captures canvas screenshot + component positions + prompt text → sends `EXPLORE_DESIGN` message with `image` and `canvasComponents` fields populated.
- Exits canvas mode and waits for options to arrive.

#### 2.3 Server WS handler (`server/websocket.ts`)

- Handle `EXPLORE_DESIGN` message:
  1. Create `explore_design` task via `addTask()`.
  2. Populate payload from message fields (element context and/or canvas image + components).
  3. Broadcast `QUEUE_UPDATE` to panel.
- Handle `DESIGN_OPTION_SELECTED` message:
  1. Look up task, validate it's in `'presenting'` status.
  2. Create an `implement` commit (or specialized task) referencing the selected story.
  3. Mark exploration task → `'done'`.
  4. Broadcast `DESIGN_EXPLORATION_COMPLETE` to overlay.
  5. Broadcast `QUEUE_UPDATE` to panel.
- Handle `DESIGN_OPTION_REFINE` message:
  1. Look up current task, validate `'presenting'` status.
  2. Create `refine_design` task with feedback + selected option + current storyIds.
  3. Mark current task → `'done'`.
  4. Broadcast `QUEUE_UPDATE` to panel (shows refining status).
- Handle `DESIGN_OPTION_EDIT` message:
  1. Look up task, validate `'presenting'` status.
  2. Broadcast `DESIGN_OPTION_EDIT_START` to overlay with the selected option's storyId.
  3. Overlay triggers spec 032 decomposition flow on the story's rendered DOM.

### Phase 3: Iframe Preview Mode

**Goal:** Render design options as full-body story previews with prev/next navigation.

#### 3.1 Preview mode in overlay (`overlay/src/design-preview.ts`)

- Exported functions: `showDesignPreview(options, shadowRoot)`, `hideDesignPreview()`, `updateDesignPreview(options)`.
- On activation: the story iframe renders full-body in the existing design canvas wrapper area (or a dedicated full-body iframe).
- One iframe at a time — prev/next re-points `iframe.src` to the next story URL.
- Story URL: `/storybook/iframe.html?id={storyId}&viewMode=story`.
- Loading detection: reuse the `adaptive-iframe` pattern (MutationObserver on `#storybook-root`) or listen for iframe `load` event + wait for content.

#### 3.2 Preview controls

Controls rendered in overlay's shadow DOM as a floating bottom bar:

- **◀ Prev / Next ▶** — switch story. Loading indicator while new story renders.
- **Option N of M + title + description** — current option label.
- **"Use this" button** — sends `DESIGN_OPTION_SELECTED { taskId, optionIndex }`. Exits preview mode.
- **"Edit this" button** — triggers spec 032 decomposition:
  1. Get the current story iframe's rendered DOM.
  2. Call `decomposeSubtree()` on the story root element (from spec 032's `overlay/src/visibility.ts`).
  3. Call `rasterizeElements()` to produce per-element PNGs (from spec 032's `overlay/src/screenshot.ts`).
  4. Open Fabric canvas with decomposed elements placed as draggable objects.
  5. Exit preview mode.
- **"Refine: [______]" input** — text refinement. Submit sends `DESIGN_OPTION_REFINE`. Shows "Refining..." while agent works. New `DESIGN_OPTIONS_READY` replaces current set.
- **"✕" (Cancel)** — sends cancel to server. Exits preview mode. Cleanup.
- **Keyboard:** ←/→ navigate, Enter "Use this", Escape cancel, Tab cycles controls.

#### 3.3 Wire to overlay messages (`overlay/src/index.ts`)

- On `DESIGN_OPTIONS_READY`: call `showDesignPreview(options, shadowRoot)`.
- On `DESIGN_EXPLORATION_COMPLETE`: call `hideDesignPreview()`.
- On `DESIGN_OPTION_EDIT_START`: trigger decomposition of current story iframe → open canvas.

### Phase 4: "Edit This" → Fabric Canvas → Re-Explore

**Goal:** The Story → Fabric → Story loop.

#### 4.1 Story DOM → Fabric (depends on spec 032)

When user clicks "Edit this":

1. The current story is rendered in the iframe.
2. Access the iframe's content document (same-origin since it's served through the `/storybook` proxy).
3. Call `decomposeSubtree(iframeDoc.querySelector('#storybook-root'))` — from spec 032.
4. Call `rasterizeElements(decomposedElements)` — from spec 032.
5. Open the Fabric design canvas with:
   - Composite screenshot as dimmed background layer.
   - Each element PNG as a draggable/resizable Fabric object with `_elementMeta`.
   - Drawing tools available for annotation.
   - Prompt input available.
6. The canvas now has two submit paths:
   - **"Explore Variations"** → `EXPLORE_DESIGN` with canvas image + element positions + prompt.
   - **"Use this as-is"** → `DESIGN_SUBMIT` for direct implementation from the visual reference.

This reuses spec 032's entire pipeline — no new decomposition or rasterization code needed.

#### 4.2 Re-exploration from canvas

When the user submits "Explore Variations" from a canvas that was loaded from a story:

- The `EXPLORE_DESIGN` message includes:
  - `image` — composite screenshot of the canvas state
  - `decomposedElements` — per-element position data (original + new rect, from spec 032's submit flow)
  - `canvasComponents` — any newly placed components
  - `prompt` — user's refinement prompt
- Agent receives all of this context in `buildExploreInstructions()`, which now includes an element rearrangement table (same format as spec 032's agent output).
- Agent writes new stories → `submit_design_options` → preview mode activates again.

This completes the loop: **Story → Fabric → Story → Fabric → ...**

### Phase 5: Implementation from Exploration

**Goal:** When user picks "Use this," the agent implements the chosen design.

#### 5.1 Implementation from "Use this" in preview mode

On `DESIGN_OPTION_SELECTED`:
- The selected story file path is the implementation reference.
- Create a commit with instructions:
  > "The user chose this design. The story at `{storyFilePath}` contains the markup. Implement it as a real component in the codebase at the target location. Reference the story for layout, components, and Tailwind classes."
- Include element context (original `EXPLORE_DESIGN` payload) so the agent knows where to insert.

#### 5.2 Implementation from "Use this as-is" on canvas

This follows the existing `DESIGN_SUBMIT` flow — canvas screenshot + element positions → `design` patch → agent implements from visual reference.

#### 5.3 Cleanup

- **After implementation:** Server deletes `src/__vybit_explore__/{taskId}/` directory. Triggered when the implementation commit is marked done via `mark_change_implemented` and the commit originated from an exploration.
- **After cancellation:** Server deletes temp directory immediately.
- **Startup sweep:** On server boot, `fs.rm` any `__vybit_explore__` directories found under the project root (orphan safety from crashes).
- **`.gitignore`:** Add `__vybit_explore__/` to prevent accidental commits of temp stories.

### Phase 6: Agent Skill File

**Goal:** Projects customize how the agent writes exploration stories.

#### 6.1 Create `.github/skills/explore-design/SKILL.md`

Default guidance for agents writing exploration stories:
- Which design system components to prefer (and import paths).
- Layout conventions (CSS Grid vs Flexbox, spacing scale).
- Story file template with project-specific Meta config.
- How to handle dark mode / theming.
- When to compose from existing components vs write inline JSX.
- How many options to generate and what variety to aim for.

Projects override this skill file for their own conventions. The `buildExploreInstructions()` references: *"If a `.github/skills/explore-design/SKILL.md` file exists, follow its guidance."*

---

## Dependency on Spec 032

This spec depends on [032 — Decomposed Moveable Objects Canvas](../032-decomposed-canvas/spec.md) for the "Edit this" flow:

| What's Needed from 032 | Used By |
|------------------------|---------|
| `decomposeSubtree(root)` — DFS walk to find visually meaningful elements | "Edit this" button: decompose story's rendered DOM |
| `rasterizeElements(elements)` — capture each element as PNG | "Edit this" button: create draggable Fabric objects |
| Fabric canvas element placement with `_elementMeta` | Canvas receives decomposed story elements |
| `decomposedElements` in `DESIGN_SUBMIT` — per-element position data | "Explore Variations" from canvas after editing a story |
| Element position table in agent instructions | Agent receives rearrangement data for next exploration round |

Spec 032 can be implemented independently — it serves the general Screenshot & Annotate flow. The "Edit this" button in this spec simply activates 032's pipeline on a story iframe instead of a page element.

---

## Files Changed

### Modified

| File | Changes |
|------|---------|
| `shared/types.ts` | `Task`, `DesignOption`, `ExploreDesignPayload`, `RefineDesignPayload`, new message types |
| `server/queue.ts` | `tasks[]` array, `addTask()`, `getNextPendingItem()`, `waitForPendingItem()`, task lifecycle methods |
| `server/mcp-tools.ts` | Generalized `implement_next_change`, new `submit_design_options` + `get_design_system_inventory` tools, `buildExploreInstructions()` + `buildRefineInstructions()` |
| `server/websocket.ts` | Handlers for `EXPLORE_DESIGN`, `DESIGN_OPTION_SELECTED`, `DESIGN_OPTION_REFINE`, `DESIGN_OPTION_EDIT` |
| `overlay/src/index.ts` | Wire `DESIGN_OPTIONS_READY`, `DESIGN_EXPLORATION_COMPLETE`, `DESIGN_OPTION_EDIT_START` to preview/canvas functions |
| `panel/src/Picker.tsx` | Integrate `ExplorePrompt` section below class chips |
| `panel/src/components/DesignCanvas/useFabricCanvas.ts` | Add "Explore Variations" submit path alongside existing "Submit Design" |
| `panel/src/DesignMode.tsx` | Support "Explore Variations" action |

### New

| File | Purpose |
|------|---------|
| `overlay/src/design-preview.ts` | Full-body iframe preview mode with prev/next controls |
| `panel/src/components/ExplorePrompt/index.ts` | Re-export |
| `panel/src/components/ExplorePrompt/ExplorePrompt.tsx` | Text input + submit + Storybook availability check |
| `panel/src/components/ExplorePrompt/ExplorePrompt.test.tsx` | Component tests |
| `.github/skills/explore-design/SKILL.md` | Agent skill: how to write exploration stories |

### Reused (no changes)

| File | What's Reused |
|------|---------------|
| `overlay/src/visibility.ts` | `decomposeSubtree()` for "Edit this" flow (from spec 032) |
| `overlay/src/screenshot.ts` | `rasterizeElements()` for "Edit this" flow (from spec 032) |
| `server/ghost-cache.ts` | `getAllCachedGhosts()` for design system inventory |
| `server/storybook.ts` | Storybook URL discovery, `/index.json` fetch |
| `panel/src/components/DrawTab/DrawTab.tsx` | `StorybookConnect` component (reuse for unavailable state) |
| `server/app.ts` | `/api/storybook-data` endpoint (availability check) |

---

## Verification

| # | Test | Type |
|---|------|------|
| 1 | Task lifecycle: add → getNext → markActive → markPresenting → markDone | Unit (`server/queue.ts`) |
| 2 | Task priority over commits in `getNextPendingItem()` | Unit (`server/queue.ts`) |
| 3 | `waitForPendingItem()` resolves on task arrival AND commit arrival | Unit (`server/queue.ts`) |
| 4 | Existing commit flow works unchanged (backward compat) | Unit (`server/queue.ts`) |
| 5 | `implement_next_change` returns `buildExploreInstructions` for explore tasks | Unit (`server/mcp-tools.ts`) |
| 6 | `implement_next_change` returns `buildCommitInstructions` for commits (unchanged) | Unit (`server/mcp-tools.ts`) |
| 7 | `submit_design_options` stores options, marks presenting, broadcasts | Unit (`server/mcp-tools.ts`) |
| 8 | `ExplorePrompt` sends correct WS message on submit | Component (`panel`) |
| 9 | `ExplorePrompt` shows `StorybookConnect` when Storybook unavailable | Component (`panel`) |
| 10 | **Path A full loop:** select element → prompt → agent writes stories → preview mode → prev/next → pick → implement → cleanup | Manual E2E |
| 11 | **Path B full loop:** open canvas → draw layout → "Explore Variations" → preview mode → pick → implement | Manual E2E |
| 12 | **Edit this loop:** browse options → "Edit this" → story decomposes into Fabric → rearrange elements → "Explore Variations" → new stories → pick → implement | Manual E2E |
| 13 | **Chat refinement:** browse options → "Refine: make it darker" → agent revises → new options appear | Manual E2E |
| 14 | Cancel: explore → cancel → preview dismissed → temp files cleaned | Manual E2E |
| 15 | Mock MCP client implement loop works unchanged (backward compat) | Manual E2E |
| 16 | Temp `__vybit_explore__/` directories deleted after implementation | Manual E2E |
| 17 | Orphaned `__vybit_explore__/` directories cleaned on server restart | Manual E2E |
| 18 | Full-page story renders correctly in iframe preview mode | Manual E2E |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Storybook HMR doesn't pick up new story files fast enough | Preview shows loading for 10+ seconds | Story files use predictable `title` paths so storyId is known immediately. Poll `/index.json` until story appears. |
| Agent writes invalid story code (syntax error, bad import) | Storybook shows error page in iframe | Agent instructions include strict template. Preview could detect Storybook error state and show "Story failed to render" with retry option. |
| Agent goes off-brand (arbitrary Tailwind instead of design system) | Options don't match project's design language | `get_design_system_inventory` provides component catalog. Skill file provides guardrails. |
| "Edit this" decomposition fails on complex story DOM | Blank or incomplete Fabric canvas | Fall back to composite screenshot as single Fabric image (same as spec 032 fallback). |
| Cross-origin iframe access for story decomposition | Can't access story iframe's DOM for "Edit this" | Stories are served through `/storybook` proxy (same origin). Verify proxy preserves DOM access. |
| Orphaned temp directories accumulate | Disk clutter, confusing Storybook sidebar | Startup sweep deletes all `__vybit_explore__/` dirs. `.gitignore` prevents commits. |
| Multiple concurrent explorations | Queue/preview confusion | For v1: only one active exploration at a time. ExplorePrompt disabled while another is in progress. |
| Storybook not running | Feature is inaccessible | Reuse `StorybookConnect` component — same UX as Components tab. |
| Full-page stories overwhelm browser (heavy components) | Slow preview transitions | One iframe at a time (re-point src, don't pre-load all). Consider `loading="lazy"` patterns. |
