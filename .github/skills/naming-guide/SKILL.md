---
name: naming-guide
description: Canonical naming for all VyBit UI parts, features, and concepts. Reference when discussing, documenting, or writing code for any part of the app. Ensures consistent terminology across humans and AI agents.
---

# VyBit Naming Guide

Canonical names for every part of VyBit, organized as a visual topology. Use these names in code comments, docs, specs, conversations, and prompts.

**Path notation example:** `Panel > Design Tab > Box Model > Side Slots`

---

## Topology

```
VyBit
├── Overlay
│   ├── Toggle Button
│   ├── Selection Mode
│   │   ├── Hover Outline
│   │   ├── Hover Tooltip
│   │   └── Highlight Overlay
│   ├── Element Toolbar
│   │   ├── Re-Select Button
│   │   ├── Draw Button
│   │   └── Select More Button
│   ├── Group Picker
│   │   ├── Exact Match Summary
│   │   ├── Similar Elements List
│   │   └── Highlight Preview
│   ├── Draw Popover
│   │   ├── Position Items
│   │   └── Screenshot & Annotate
│   ├── Toast Notification
│   ├── Drop Zone
│   │   ├── Cursor Label
│   │   ├── Drop Indicator
│   │   └── Arrow Indicators
│   └── Containers
│       ├── Modal
│       ├── Popover
│       ├── Sidebar
│       └── Popup
│
├── Panel
│   ├── Header
│   │   ├── Select Element Button
│   │   ├── Element Info
│   │   └── Container Switcher
│   ├── Tab Bar
│   ├── Design Tab
│   │   ├── Box Model
│   │   │   ├── Layer Rings
│   │   │   ├── Side Slots
│   │   │   ├── Corner Slots
│   │   │   ├── Shorthand Slot
│   │   │   └── Mini Scrubber
│   │   ├── Corner Model
│   │   │   ├── Center Slot
│   │   │   ├── Edge Slots
│   │   │   └── Corner Slots
│   │   ├── Property Sections
│   │   │   ├── Section Header
│   │   │   ├── Add Property Dropdown
│   │   │   ├── Scale Scrubber
│   │   │   ├── Class Chip
│   │   │   └── Empty State
│   │   ├── Color Grid
│   │   │   ├── Special Colors Row
│   │   │   ├── Hue Rows
│   │   │   └── Color Cell
│   │   ├── Flex Controls
│   │   │   ├── Flex Direction Select
│   │   │   ├── Flex Wrap Select
│   │   │   ├── Flex Justify Select
│   │   │   ├── Flex Align Select
│   │   │   └── Gap Model
│   │   ├── Gradient Editor
│   │   │   ├── Direction Picker
│   │   │   ├── Gradient Bar
│   │   │   └── Color Swatch
│   │   └── Shadow Editor
│   │       ├── Shadow Layer Row
│   │       └── Ghost Row
│   ├── Components Tab
│   │   ├── Component List
│   │   │   ├── Component Group Item
│   │   │   └── Armed State
│   │   ├── Loading State
│   │   └── Storybook Not Detected
│   ├── Message Tab
│   │   ├── Compose Area
│   │   │   ├── Microphone Button
│   │   │   └── Add Message Button
│   │   └── Staged Messages List
│   ├── Queue Footer
│   │   ├── Connection Status Warning
│   │   ├── No Agent Watching Warning
│   │   └── Patch Queue Popovers
│   │       ├── Draft Popover
│   │       ├── Committed Popover
│   │       ├── Implementing Popover
│   │       └── Implemented Popover
│   └── Design Mode
│       └── Design Canvas
│
├── Server
│   ├── Patch Queue
│   ├── MCP Tools
│   │   ├── implement_next_change
│   │   ├── get_next_change
│   │   ├── mark_change_implemented
│   │   ├── list_changes
│   │   └── discard_all_changes
│   ├── Tailwind Compiler
│   ├── Ghost Cache
│   └── WebSocket Hub
│
└── Storybook Addon
    ├── Addon Panel
    ├── Preview Decorator
    └── Preset
```

---

## Overlay (`overlay/src/`)

The Overlay is the layer injected into the user's running app. It handles element selection, visual feedback, and hosts the Panel.

| Name | Description | File |
|------|-------------|------|
| **Toggle Button** | Fixed circle at bottom-right that activates/deactivates VyBit | `index.ts` |
| **Selection Mode** | Crosshair cursor state where hovering highlights elements for picking | `index.ts` |
| **Hover Outline** | Teal border that follows the mouse during Selection Mode | `index.ts` |
| **Hover Tooltip** | Floating pill showing `<ComponentName> tag.class` during hover | `index.ts` |
| **Highlight Overlay** | Pulsing teal/orange border around the currently selected element | `index.ts` |
| **Element Toolbar** | Horizontal dark action bar floating above the selected element | `index.ts` |
| **Re-Select Button** | Cursor icon in the toolbar — re-enters Selection Mode | `index.ts` |
| **Draw Button** | Pencil icon in the toolbar — opens the Draw Popover | `index.ts` |
| **Select More Button** | "N +" badge in the toolbar — opens the Group Picker | `index.ts` |
| **Group Picker** | Popover listing exact matches and similar elements with checkboxes | `index.ts` |
| **Exact Match Summary** | Count chip + "N exact match(es) selected" at the top of Group Picker | `index.ts` |
| **Similar Elements List** | Checkbox rows showing class diffs (`+added` / `−removed`) | `index.ts` |
| **Highlight Preview** | Dashed teal outlines shown on page elements when hovering a group row | `index.ts` |
| **Draw Popover** | Menu for inserting a drawing canvas before/after/inside an element, or taking a screenshot | `index.ts` |
| **Position Items** | Before / After / First Child / Last Child insertion options inside Draw Popover | `index.ts` |
| **Screenshot & Annotate** | Camera icon option — captures the selected region for annotation | `index.ts` |
| **Toast Notification** | Dark status bar that appears at the top-center for brief messages | `index.ts` |
| **Drop Zone** | Component placement mode — cursor becomes a crosshair with a ghost preview | `drop-zone.ts` |
| **Cursor Label** | Floating pill reading "Place: ComponentName" during Drop Zone mode | `drop-zone.ts` |
| **Drop Indicator** | Visual marker showing the pending insertion position | `drop-zone.ts` |
| **Arrow Indicators** | Left/right arrows showing flex/grid axis direction at a drop target | `drop-zone.ts` |
| **Containers** | The four modes for embedding the Panel in a page | `containers/` |
| **Modal** | Draggable, resizable floating window | `containers/ModalContainer.ts` |
| **Popover** | Panel that slides in from the right edge of the page | `containers/PopoverContainer.ts` |
| **Sidebar** | Persistent right sidebar that pushes page content left | `containers/SidebarContainer.ts` |
| **Popup** | Panel opened in a separate browser window | `containers/PopupContainer.ts` |

---

## Panel (`panel/src/`)

The Panel is the React inspector UI where users edit Tailwind classes, place components, and send messages to the agent.

| Name | Description | File |
|------|-------------|------|
| **Header** | Top bar with element info and controls | `App.tsx` |
| **Select Element Button** | Toggle in the header that activates Selection Mode | `App.tsx` |
| **Element Info** | Component name + instance count shown in the header when an element is selected | `App.tsx` |
| **Container Switcher** | Header dropdown to switch between Modal / Popover / Sidebar / Popup | `App.tsx` |
| **Tab Bar** | Design \| Components \| Message navigation tabs | `components/TabBar/` |
| **Design Tab** | Main Tailwind class editing UI | `Picker.tsx` |
| **Box Model** | Nested ring diagram for editing margin, outline, border, and padding | `components/BoxModel/` |
| **Layer Rings** | Concentric rings from outside in: margin → outline → border → padding → content | `components/BoxModel/` |
| **Side Slots** | Top / right / bottom / left value slots within a layer ring | `components/BoxModel/` |
| **Corner Slots** | Top-left / top-right / bottom-right / bottom-left slots within a layer ring | `components/BoxModel/` |
| **Shorthand Slot** | Center slot that sets all sides of a layer at once | `components/BoxModel/` |
| **Mini Scrubber** | Inline drag-to-scrub + dropdown control used inside Box Model, Corner Model, and Gap Model | `components/BoxModel/` |
| **Corner Model** | 3×3 grid for editing border-radius: corners, edges, and a shorthand center | `components/CornerModel/` |
| **Property Sections** | Collapsible groups for Layout, Sizing, Typography, Backgrounds, Effects, etc. | `components/PropertySection/` |
| **Section Header** | Disclosure arrow + label + collapsed count badge + [+] Add button | `components/PropertySection/` |
| **Add Property Dropdown** | Focus-trapped list of properties the user can add to the section | `components/PropertySection/` |
| **Scale Scrubber** | Drag horizontally to scrub through a property's scale; click to open dropdown | `components/ScaleScrubber/` |
| **Class Chip** | Static chip displaying a Tailwind class; hover reveals a remove (×) button | `Picker.tsx` |
| **Color Grid** | Floating palette popup for picking Tailwind colors | `components/ColorGrid.tsx` |
| **Special Colors Row** | Black, white, transparent, and remove swatches at the top of the Color Grid | `components/ColorGrid.tsx` |
| **Hue Rows** | One row per hue (red, orange, yellow…slate) with shade columns (50–950) | `components/ColorGrid.tsx` |
| **Color Cell** | Individual color swatch — hover to preview in app, click to apply | `components/ColorGrid.tsx` |
| **Flex Controls** | Direction / wrap / justify / align / gap controls shown when element is `display:flex` | `Picker.tsx` |
| **Flex Direction Select** | 4 arrow buttons: row / column / row-reverse / column-reverse | `components/FlexDirectionSelect/` |
| **Flex Wrap Select** | 3 buttons: wrap / nowrap / wrap-reverse | `components/FlexWrapSelect/` |
| **Flex Justify Select** | Dropdown with alignment diagrams for `justify-content` | `components/FlexJustifySelect/` |
| **Flex Align Select** | Dropdown with alignment diagrams for `align-items` | `components/FlexAlignSelect/` |
| **Gap Model** | Visual grid showing gap areas with Mini Scrubbers for gap / gap-x / gap-y | `components/GapModel/` |
| **Gradient Editor** | Composer for solid color or multi-stop gradient with direction control | `components/GradientEditor/` |
| **Direction Picker** | 4 arrow buttons + center toggle (solid color vs gradient) | `components/DirectionPicker/` |
| **Gradient Bar** | Horizontal preview bar with draggable stop handles for each color stop | `components/GradientBar/` |
| **Color Swatch** | Rectangular display of the current solid background color | `components/GradientEditor/` |
| **Shadow Editor** | Layer composer for shadow, inset-shadow, ring, inset-ring, and text-shadow | `components/ShadowEditor/` |
| **Shadow Layer Row** | Active layer: size scrubber + color swatch + opacity scrubber + live preview square | `components/ShadowEditor/` |
| **Ghost Row** | [+] button row for adding a shadow type that isn't yet applied | `components/ShadowEditor/` |
| **Components Tab** | Storybook component library with arm/place workflow | `components/DrawTab/` |
| **Component List** | Scrollable list of available Storybook components | `components/DrawTab/` |
| **Component Group Item** | One component: name + arm button + optional story selector + args | `components/DrawTab/` |
| **Armed State** | Highlighted state of a Component Group Item when the component is ready to place | `components/DrawTab/` |
| **Message Tab** | Voice/text context messaging for the AI agent | `components/MessageTab/` |
| **Compose Area** | Textarea + Microphone Button + Add Message Button | `components/MessageTab/` |
| **Microphone Button** | Toggles voice recording; shows a red pulse dot when active | `components/MessageTab/` |
| **Add Message Button** | Submits the composed message as a staged patch | `components/MessageTab/` |
| **Staged Messages List** | List of queued message patches with remove buttons | `components/MessageTab/` |
| **Queue Footer** | Status bar at the bottom of the Panel | `App.tsx` |
| **Connection Status Warning** | Amber "No agent listening" banner shown when WebSocket is disconnected | `App.tsx` |
| **No Agent Watching Warning** | Amber "No agent watching" banner shown when patches are staged but no agent is polling | `App.tsx` |
| **Patch Queue Popovers** | Clickable status counters that expand to show the patch list for each status | `components/PatchPopover/` |
| **Draft Popover** | Amber counter — staged (draft) patches; includes commit all / discard all actions | `components/PatchPopover/` |
| **Committed Popover** | Teal counter — patches committed and awaiting agent pickup | `components/PatchPopover/` |
| **Implementing Popover** | Blue counter — patches the agent is currently working on | `components/PatchPopover/` |
| **Implemented Popover** | Green counter — patches the agent has completed | `components/PatchPopover/` |
| **Design Mode** | Full-page Fabric.js canvas for drawing and annotation (separate route `?mode=design`) | `DesignMode.tsx` |
| **Design Canvas** | The drawing surface + component placement area inside Design Mode | `components/DesignCanvas/` |

---

## Server (`server/`)

| Name | Description | File |
|------|-------------|------|
| **Patch Queue** | Two-phase staging system: draft patches → committed batches → agent implementation | `queue.ts` |
| **MCP Tools** | Agent-facing tool endpoints exposed over the MCP protocol | `mcp-tools.ts` |
| **`implement_next_change`** | Looping entry point — waits for a committed change and returns it with instructions | `mcp-tools.ts` |
| **`get_next_change`** | Raw data retrieval for custom agent workflows (no instructions) | `mcp-tools.ts` |
| **`mark_change_implemented`** | Marks a change done and directs the agent to call `implement_next_change` again | `mcp-tools.ts` |
| **`list_changes`** | Lists all changes grouped by status | `mcp-tools.ts` |
| **`discard_all_changes`** | Clears all draft and committed queues | `mcp-tools.ts` |
| **Tailwind Compiler** | Generates CSS from Tailwind class lists; supports both v3 and v4 via adapters | `tailwind.ts` |
| **Ghost Cache** | Cached HTML snapshots of Storybook components used for placement preview | `ghost-cache.ts` |
| **WebSocket Hub** | Routes messages between Overlay, Panel, and Design clients | `websocket.ts` |

---

## Storybook Addon (`storybook-addon/`)

| Name | Description | File |
|------|-------------|------|
| **Addon Panel** | Iframe embedding the VyBit Panel as a tab inside Storybook | `manager.tsx` / `manager-v10.tsx` |
| **Preview Decorator** | Injects `overlay.js` into story iframes so the overlay runs per-story | `preview.ts` / `preview-v10.ts` |
| **Preset** | Auto-detects SB8 vs SB10 and routes to the correct entry points | `preset.js` |

---

## Glossary

Key internal terms and how they relate to user-facing language.

| Term | Meaning |
|------|---------|
| **Change** | The user-facing / MCP tool name for an edit the user wants the AI agent to make |
| **Patch** | The internal code name for a Change. Kinds: `class-change`, `message`, `design`, `component-drop` |
| **Commit** (noun) | A batch of patches the user has finalized and pushed to the agent queue |
| **Stage** | Add a patch to the draft queue (not yet sent to the agent) |
| **Commit** (verb) | Finalize staged patches into a Commit for the agent to pick up |
| **Patch Status** | Lifecycle: `staged` → `committed` → `implementing` → `implemented` / `error` |
| **Ghost** | A cached HTML snapshot of a Storybook component, used for previewing placement |
| **Armed** | A component selected and ready to place — the overlay shows its Ghost following the cursor |
| **Scale** | The ordered list of Tailwind values for a property (e.g., spacing: 0, 1, 2, 3, 4…) |
| **Scrub** | Drag horizontally across a Scale to step through values, live-previewing each in the app |
| **Preview** | Temporarily applying a class change in the browser; reverts automatically when the cursor leaves |
| **Container** | How the Panel is embedded in the page: Modal, Popover, Sidebar, or Popup |
