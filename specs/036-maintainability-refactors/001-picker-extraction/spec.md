# 036-001 — Picker.tsx Extraction

## Problem

`panel/src/Picker.tsx` is 1,293 lines in a single exported function component. It handles:

- BoxModel slot orchestration (hover/change/remove callbacks, local override state)
- CornerModel slot orchestration (same pattern, separate override state)
- GradientEditor integration
- ShadowEditor integration (size-vs-color property dedup, multi-class removal)
- Flex-parent grouped controls (direction, wrap, justify, align, gap)
- Per-section property chips, scrubbers, and pending/staged ghost controls
- Three independent color picker portals (BoxModel, chip, shadow) with floating-ui

The component has **10 useState hooks**, **2 useFloating instances**, and **30+ inline callback handlers** that close over mutable state. Code review, testing, and modification all require understanding the full 1,293 lines.

### Specific Smells

1. **Three color picker state branches** — `boxModelColorPicker`, `chipColorPicker`, `shadowColorPicker` follow near-identical patterns (open/stage/revert/close) but are managed as independent useState hooks with separate FloatingPortal blocks.

2. **BoxModel callback prop drilling** — `onSlotHover`, `onSlotChange`, `onSlotRemove`, `onSlotRemoveHover`, `onSlotClick` all contain ~15 lines of identical "look up override, find base layer, compute currentClass" logic.

3. **Shadow staging dedup** — `isSizeClass()` helper is defined **twice** inline (once in `onStage`, once in `onRemove`), each ~15 lines.

4. **Flex controls** — 4 select components (FlexDirectionSelect, FlexWrapSelect, FlexJustifySelect, FlexAlignSelect) + GapModel are wired up with nearly identical `resolvePropertyState` → preview → stage patterns.

5. **`resolvePropertyState()`** — called 9+ times in the render body with different arguments; the pattern of "find staged patch, compute effective class" is a mini state machine embedded inline.

## Proposed Changes

### Phase 1: Extract Composite Section Hooks

Extract the callback wiring for each composite control into dedicated hooks. Each hook encapsulates the local override state, preview/stage callbacks, and returns props ready to spread onto the component.

#### `useBoxModelSection` hook

**New file:** `panel/src/hooks/useBoxModelSection.ts`

Encapsulates:
- `boxModelOverrides` state (Map)
- `boxModelColorPicker` state
- `boxModelHoveredColorRef`
- All BoxModel callback props: `onSlotHover`, `onSlotChange`, `onSlotRemove`, `onSlotRemoveHover`, `onSlotClick`, `onEditStart`
- `applyBoxModelOverrides()` logic
- The color picker FloatingPortal JSX (returned as a render function or component)

**Interface:**
```typescript
function useBoxModelSection(args: {
  parsedClasses: ParsedToken[];
  tailwindConfig: any;
  patchManager: PatchManager;
  elementKey: string;
  stagedPatches: Patch[];
  onStage: (property: string, original: string, newClass: string) => void;
}): {
  boxModelProps: BoxModelProps;
  colorPickerPortal: React.ReactNode;
  resetState: () => void;
}
```

#### `useCornerModelSection` hook

**New file:** `panel/src/hooks/useCornerModelSection.ts`

Encapsulates:
- `cornerOverrides` state (Map)
- `applyCornerOverrides()` logic
- `cornerModelStateFromClasses()` (move from Picker.tsx module scope)
- All CornerModel callback props

#### `useShadowSection` hook

**New file:** `panel/src/hooks/useShadowSection.ts`

Encapsulates:
- `shadowColorPicker` state
- The `isSizeClass()` helper (single definition)
- `computeEffectiveShadowClasses` call
- All ShadowEditor callback props including `onStage`, `onAdd`, `onRemove`, `onRemoveHover`, `onColorClick`

#### `useFlexSection` hook

**New file:** `panel/src/hooks/useFlexSection.ts`

Encapsulates:
- Flex-parent detection logic (currently ~20 lines of boolean computation)
- `resolvePropertyState` calls for display, flex-direction, flex-wrap, justify-content, align-items, gap/gap-x/gap-y
- Props for FlexDirectionSelect, FlexWrapSelect, FlexJustifySelect, FlexAlignSelect, GapModel

### Phase 2: Consolidate Color Picker State

Replace the three independent color picker useState hooks with a single discriminated union:

```typescript
type ColorPickerState =
  | { kind: 'none' }
  | { kind: 'box-model'; layer: LayerName; prefix: string; currentClass: string; staged: boolean; anchorEl: Element }
  | { kind: 'chip'; cls: ParsedToken; anchorEl: Element }
  | { kind: 'shadow'; layer: ShadowLayerState; anchorEl: Element };
```

This eliminates the possibility of two color pickers being open simultaneously (currently possible by setting state independently) and reduces the FloatingPortal to a single instance with conditional rendering.

**New file:** `panel/src/hooks/useColorPicker.ts`

### Phase 3: Extract `resolvePropertyState` to a Utility

Move `resolvePropertyState` from an inline closure to a pure function:

```typescript
// panel/src/utils/resolvePropertyState.ts
export function resolvePropertyState(
  property: string,
  token: ParsedToken | undefined,
  stagedPatches: StagedPatch[],
): { originalClass: string; effectiveClass: string; hasValue: boolean }
```

This removes the closure dependency on `stagedPatches` and makes the function independently testable.

### Phase 4: Deduplicate `isSizeClass`

Extract to `panel/src/components/ShadowEditor/shadowUtils.ts` (or add to existing):

```typescript
export function isShadowSizeClass(cls: string): boolean;
export function shadowBaseType(cls: string): 'shadow' | 'inset-shadow' | 'ring' | 'inset-ring' | 'text-shadow';
```

These already partially exist in `shadowUtils.ts` — consolidate the inline definitions into the existing module.

## File Impact

| File | Change |
|------|--------|
| `panel/src/Picker.tsx` | Shrinks from ~1,293 to ~400–500 lines |
| `panel/src/hooks/useBoxModelSection.ts` | New (~150 lines) |
| `panel/src/hooks/useCornerModelSection.ts` | New (~80 lines) |
| `panel/src/hooks/useShadowSection.ts` | New (~100 lines) |
| `panel/src/hooks/useFlexSection.ts` | New (~120 lines) |
| `panel/src/hooks/useColorPicker.ts` | New (~60 lines) |
| `panel/src/components/ShadowEditor/shadowUtils.ts` | Add `isShadowSizeClass`, `shadowBaseType` |

## Testing Strategy

1. **Before extracting:** ensure existing Storybook stories and E2E tests pass
2. **After each hook extraction:** run `npm test` from `panel/` to verify no regressions
3. **Unit test each hook** with `renderHook` from `@testing-library/react` — mock `patchManager` and `sendTo`, verify preview/stage/revert callbacks fire correct messages
4. **E2E smoke test:** select an element, scrub a spacing value, stage it — verify patch appears in queue

## Out of Scope

- Changing the BoxModel/CornerModel/ShadowEditor/GradientEditor component APIs
- Adding new UI features or controls  
- Refactoring `resolvePropertyState` into a reducer/state machine (future work)
- Extracting `PropertySection` rendering loop into its own component (minor gain, can be done later)
