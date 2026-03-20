# Spec 21: No Connection State Behavior

## Goal
Restore the ability to make changes to the queue **even when the overlay connection is lost or not yet established**, while keeping the new dark theme design.

## Current Problem
When the overlay is not connected (or connection is lost), users report the panel shows a "full-screen blocking" state that makes it feel like they cannot:
- View their staged/committed changes
- Access the helpful docs link for setup
- Copy and send prompts to their AI agent
- See the queue status

While the code *does* include `{queueFooter}` at the bottom, the visual dominance of the centered "Waiting for connection..." message makes users feel blocked.

## Old Behavior (v0.4.8 - commit d81418d, with structure from 07ac542)
When `!wsConnected`, the panel displayed a two-section layout:

### Layout Structure:
```
╔─────────────────────────────────────╗
│                                     │
│   [flex-1 center, takes up space]   │  ← MIDDLE: Connection state indicator
│         ● pulsing dot               │
│  Waiting for connection…            │
│                                     │
├─────────────────────────────────────┤  ← BOTTOM: Always visible, not blocked
│ [No agent watching warning panel]   │
│ 🚨 No agent watching —              │
│    [ask your agent] to start        │
│    [Copy prompt] button             │
├─────────────────────────────────────┤
│ draft: 0 | committed: 0 | ...       │  ← Queue status counts
└─────────────────────────────────────┘
```

### User can still:
1. **Middle section**: Pulsing dot + "Waiting for connection…" (informative only, not blocking)

2. **Bottom section (always usable)**:
   - **"No agent watching" warning panel** (amber, light theme at that time):
     - Warning icon
     - Text: "No agent watching — [ask your agent](https://github.com/bitovi/vybit?tab=readme-ov-file#telling-your-agent-to-start-making-features) to start"
     - **Copy prompt button** — copies: "Please implement the next change and continue implementing changes with VyBit."
     - **Click the docs link** to see setup instructions
   
   - **Queue status bar** with all patch counts (fully interactive):
     - Draft (staged changes) — can expand/interact
     - Committed changes — can expand/interact
     - Implementing changes — can expand/interact
     - Implemented changes — can expand/interact
     - Each with a popover showing detailed patch list

## Code Reference

### Panel/src/App.tsx at 07ac542 (where queueFooter was added to no-connection state)

```tsx
// No-connection state rendering - TWO SECTION LAYOUT
if (!wsConnected) {
  return (
    <div className="h-full flex flex-col">
      {/* MIDDLE: Takes flex-1 space, centers the waiting message */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <div className="w-2 h-2 rounded-full bg-bv-orange animate-pulse" />
        <span className="text-bv-text-mid text-[12px]">Waiting for connection…</span>
      </div>
      {/* BOTTOM: Shrink-0, always visible at bottom */}
      {queueFooter}
    </div>
  );
}


// Lines 49-83: The queueFooter that appears at the bottom of no-connection state
const queueFooter = (
  <div className="h-full flex flex-col">
    {showNoAgentWarning && (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border-t border-amber-200 text-amber-700 text-[10px] font-medium">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="shrink-0 text-amber-500">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.19-1.458-1.516-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <span className="flex-1 leading-tight">
          No agent watching —{' '}
          <a
            href="https://github.com/bitovi/vybit?tab=readme-ov-file#telling-your-agent-to-start-making-features"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-amber-900"
          >ask your agent</a>
          {' '}to start
        </span>
        <button
          onClick={() => copyToClipboard(VYBIT_PROMPT)}
          className="shrink-0 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold text-[9px] transition-colors"
          title={`Copy: "${VYBIT_PROMPT}"`}
        >
          Copy prompt
        </button>
      </div>
    )}
    {/* Queue status bar with patch counts */}
    <div className="flex items-center justify-center px-3 py-1.5 border-t border-bv-border gap-2.5">
      <PatchPopover label="staged" count={staged} items={...} />
      <span className="text-bv-border text-[11px]">·</span>
      <PatchPopover label="committed" count={committed} items={...} />
      <span className="text-bv-border text-[11px]">·</span>
      <PatchPopover label="implementing" count={implementing} items={...} />
      <span className="text-bv-border text-[11px]">·</span>
      <PatchPopover label="implemented" count={implemented} items={...} />
    </div>
  </div>
);
```

## Design Requirements

### Light Theme (v0.4.8 reference)
- **Waiting message wrapper**: `flex-1` (takes up middle space), `flex flex-col items-center justify-center`
- **Pulsing dot**: `bg-bv-orange animate-pulse`
- **No-connection warning panel** (at bottom):
  - Background: `bg-amber-50`
  - Border: `border-amber-200`
  - Text: `text-amber-700`
- **Link**: `underline hover:text-amber-900`
- **Copy button**: `border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-700`

### New Dark Theme (apply to dark theme palette)
Update the no-connection structure to match dark theme design:
- Keep the **two-section layout** (middle waiting message + bottom queue footer)
- Swap amber colors to dark amber equivalents:
  - `bg-amber-50` → `bg-amber-950/40` or `bg-amber-900/30`
  - `border-amber-200` → `border-amber-800/40` or `border-amber-700/30`
  - `text-amber-700` → `text-amber-300`
  - `text-amber-500` → `text-amber-400`
  - Link: `hover:text-amber-900` → `hover:text-amber-100`
  - Button: `border-amber-300 bg-amber-100 hover:bg-amber-200` → `border-amber-700/50 bg-amber-900/40 hover:bg-amber-800/40`
- Keep the same layout structure and functionality

## User Interaction Flow

1. **Panel opens before overlay connects** (or connection is lost)

2. **Middle section**: Shows pulsing dot + "Waiting for connection…" (informative, takes up flex-1 space)

3. **Bottom section (ALWAYS AVAILABLE)**:
   - User can read the "No agent watching" warning
   - User can **click "Copy prompt"** to copy the agent instruction
   - User can **click the "ask your agent" link** to go to setup docs on GitHub
   - User can **expand queue popovers** to see staged/committed/implementing/implemented changes
   - **All queue interactions are fully functional** (drag, expand, expand/collapse, hover effects, etc.)

4. **After overlay reconnects**:
   - Panel transitions to normal inspector mode with element selection
   - "Waiting for connection" state fully resolved

## Files to Update

- `panel/src/App.tsx` 
  - Ensure `!wsConnected` block maintains **two-section layout**:
    - Middle: `flex-1` wrapper with centered "Waiting for connection…" message
    - Bottom: `{queueFooter}` with `shrink-0` (always visible at bottom)
  - Apply dark theme colors to the `showNoAgentWarning` warning panel
  - Ensure `queueFooter` is rendered and interactive when `!wsConnected`

## Visual Improvements Needed

### 1. Queue Footer Status Indicators (Remove always-on dots)
**Current behavior (dark theme changes):**
- All patch popovers show colored status dots at all times:
  - Draft: amber
  - Committed: emerald  
  - Implementing: blue
  - Implemented: green

**Problem:** The dots make the queue footer too "noisy" and don't add meaningful information since `count: 0` is already displayed as disabled/muted.

**Solution:**
- Remove `dotColor` props from all PatchPopover calls
- Only show a warning/error indicator dot when there's an actual warning condition (e.g., committed changes but no connection to apply them)
- This makes the queue footer cleaner and reserve the dot for meaningful status indicators

### 2. Queue Footer Font Size (Too Small)
**History:**
- Before dark theme (v0.6.0): No explicit font size (inherited from parent)
- Dark theme introduced: `text-[9px]` - significantly smaller
- Qualifier dots (·) were always: `text-[11px]`
- Result: Queue footer text is noticeably smaller than interface expects

**Solution:**
- Increase from `text-[9px]` to `text-[10px]`
- This makes the queue footer an important visible part of the UI again
- Still compact but clearly readable

## Implementation Status

✅ **COMPLETED:**
- Removed colored status dots from all four PatchPopover indicators (draft, committed, implementing, implemented)
- Increased queue footer font size from `text-[9px]` to `text-[10px]`
- Tests: All 247 panel tests pass ✓
- TypeScript compilation: No errors ✓

**Changes Made in `panel/src/App.tsx`:**
1. Removed `dotColor` prop from all 4 PatchPopover components (lines ~244-276):
   - Draft: removed `dotColor="bg-amber-400"`
   - Committed: removed `dotColor="bg-emerald-400"`
   - Implementing: removed `dotColor="bg-blue-400"`
   - Implemented: removed `dotColor="bg-green-400"`

2. Updated queue footer container className (line 243):
   - Changed: `className="flex items-center justify-center px-3 py-1.5 border-t border-bv-border gap-3 text-[9px]"`
   - To: `className="flex items-center justify-center px-3 py-1.5 border-t border-bv-border gap-3 text-[10px]"`

## Future: Context-Aware Warning Dots
Reserve the use of `dotColor` for future implementation of warning/error indicators:
- Example: Show a red or orange dot on "committed" when there are committed changes but no server connection to apply them
- Example: Show a red dot on "implementing" if there were errors during implementation
- This makes the dot a meaningful status signal rather than always-on noise

Current implementation: Button styling already shows disabled/muted state for zero-count items, providing sufficient visual feedback.

## Investigation Notes

**Current Status (aed8895 HEAD):**
The code structure **already has** the two-section layout with `{queueFooter}` at the bottom (shrink-0). The queue footer is rendered when `!wsConnected`. However, users report it feels like a "full-screen blocking" message.

**Potential Issues:**
1. **CSS/Layout**: The `flex-1` wrapper in the waiting message might be taking up too much visual space, making the bottom queue footer appear inaccessible or non-obvious
2. **Design perception**: The dark theme makes the queue footer less visually prominent than before
3. **Visual noise**: Colored dots on all queue status indicators make the footer feel cluttered
4. **Font size**: The 9px font size is notably smaller than previous 11px separators
5. **UX expectation**: Users expect to interact with changes immediately, but the centered waiting message feels like a loading/blocked state

**Solution:** Restore visual hierarchy so users can see and interact with the queue footer while waiting for connection, and clean up visual noise.
