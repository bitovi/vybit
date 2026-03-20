import { describe, it, expect } from 'vitest';
import {
  computeEffectiveShadowClasses,
  parsedClassesToShadowLayers,
  applyShadowTypePatch,
  SHADOW_SIZE_SET,
} from './shadowUtils';
import type { StagedPatch } from './shadowUtils';

// === applyShadowTypePatch ===

describe('applyShadowTypePatch', () => {
  it('replaces size class in-place when originalClass is in typeClasses', () => {
    const result = applyShadowTypePatch(['shadow-sm'], 'shadow-sm', 'shadow-md', 'shadow-', SHADOW_SIZE_SET);
    expect(result).toEqual(['shadow-md']);
  });

  it('removes originalClass when newClass is empty (case 1 — color removal)', () => {
    const result = applyShadowTypePatch(['shadow-sm', 'shadow-blue-500'], 'shadow-blue-500', '', 'shadow-', SHADOW_SIZE_SET);
    // Should keep shadow-sm, remove shadow-blue-500
    expect(result).toEqual(['shadow-sm']);
  });

  it('adds newClass when originalClass is empty (add via + button)', () => {
    const result = applyShadowTypePatch([], '', 'shadow-md', 'shadow-', SHADOW_SIZE_SET);
    expect(result).toEqual(['shadow-md']);
  });

  it('falls back to newClass when typeClasses is empty and originalClass was from a prior staged change', () => {
    // User staged sm→md (originalClass=sm in raw), then changed to lg
    // The new patch has originalClass=md (from effective), but raw has sm
    const result = applyShadowTypePatch([], 'shadow-md', 'shadow-lg', 'shadow-', SHADOW_SIZE_SET);
    expect(result).toEqual(['shadow-lg']);
  });

  it('uses same-category replacement when originalClass is not in typeClasses but typeClasses non-empty', () => {
    // Staged twice: sm→md, then md→lg (second replaces first patch)
    // raw has shadow-sm, patch.originalClass is shadow-md (from effective)
    const result = applyShadowTypePatch(['shadow-sm'], 'shadow-md', 'shadow-lg', 'shadow-', SHADOW_SIZE_SET);
    expect(result).toEqual(['shadow-lg']);
  });
});

// === parsedClassesToShadowLayers ===

describe('parsedClassesToShadowLayers', () => {
  it('parses shadow-sm into a shadow layer with sizeClass', () => {
    const layers = parsedClassesToShadowLayers('shadow-sm', null);
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe('shadow');
    expect(layers[0].sizeClass).toBe('shadow-sm');
    expect(layers[0].colorClass).toBeNull();
  });

  it('parses shadow-sm shadow-blue-500 into one shadow layer with both classes', () => {
    const layers = parsedClassesToShadowLayers('shadow-sm shadow-blue-500', null);
    expect(layers).toHaveLength(1);
    expect(layers[0].sizeClass).toBe('shadow-sm');
    expect(layers[0].colorClass).toBe('shadow-blue-500');
  });

  it('returns no layers for empty string', () => {
    expect(parsedClassesToShadowLayers('', null)).toHaveLength(0);
  });

  it('parses multiple shadow types independently', () => {
    const layers = parsedClassesToShadowLayers('shadow-sm ring-2', null);
    expect(layers).toHaveLength(2);
    expect(layers.find(l => l.type === 'shadow')?.sizeClass).toBe('shadow-sm');
    expect(layers.find(l => l.type === 'ring')?.sizeClass).toBe('ring-2');
  });
});

// === computeEffectiveShadowClasses ===

describe('computeEffectiveShadowClasses — size changes', () => {
  it('applies a size patch: shadow-sm → shadow-md', () => {
    const patches: StagedPatch[] = [{ property: 'shadow', originalClass: 'shadow-sm', newClass: 'shadow-md' }];
    const eff = computeEffectiveShadowClasses('shadow-sm', patches);
    expect(eff).toBe('shadow-md');
    const layers = parsedClassesToShadowLayers(eff, null);
    expect(layers.find(l => l.type === 'shadow')).toBeDefined();
    expect(layers.find(l => l.type === 'shadow')?.sizeClass).toBe('shadow-md');
  });

  it('handles second size staging (md→lg, raw still has sm)', () => {
    const patches: StagedPatch[] = [{ property: 'shadow', originalClass: 'shadow-md', newClass: 'shadow-lg' }];
    const eff = computeEffectiveShadowClasses('shadow-sm', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    expect(layers.find(l => l.type === 'shadow')?.sizeClass).toBe('shadow-lg');
  });
});

describe('computeEffectiveShadowClasses — color removal bug', () => {
  /**
   * BUG: Removing only the color class (via color picker "remove") was causing the
   * entire shadow type to disappear from effective classes — including the size class.
   *
   * The root cause was that the `else if (!patch.newClass)` branch treated ALL removal
   * patches the same way (contributing nothing), whether they were removing a size class
   * or only a color class.
   *
   * Fix: distinguish size-class removals (ghost row intent) from color-class removals
   * (keep size, remove only color) before deciding whether to call applyShadowTypePatch.
   */

  it('color removal keeps the size class visible — shadow row must NOT disappear', () => {
    // This is the bug scenario:
    // Raw DOM has shadow-sm shadow-blue-500.
    // User removes only the color via the color picker.
    // Expected: shadow row shows with sizeClass=shadow-sm (no colorClass).
    const patches: StagedPatch[] = [
      { property: 'shadow', originalClass: 'shadow-blue-500', newClass: '' },
    ];
    const eff = computeEffectiveShadowClasses('shadow-sm shadow-blue-500', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    const shadowLayer = layers.find(l => l.type === 'shadow');
    expect(shadowLayer).toBeDefined(); // row must not disappear
    expect(shadowLayer?.sizeClass).toBe('shadow-sm');
    expect(shadowLayer?.colorClass).toBeNull();
  });

  it('color removal with opacity (shadow-blue-500/80 → "") keeps the size class', () => {
    const patches: StagedPatch[] = [
      { property: 'shadow', originalClass: 'shadow-blue-500/80', newClass: '' },
    ];
    const eff = computeEffectiveShadowClasses('shadow-sm shadow-blue-500/80', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    const shadowLayer = layers.find(l => l.type === 'shadow');
    expect(shadowLayer).toBeDefined();
    expect(shadowLayer?.sizeClass).toBe('shadow-sm');
  });

  it('ring color removal keeps the ring size class visible', () => {
    const patches: StagedPatch[] = [
      { property: 'ring', originalClass: 'ring-indigo-500', newClass: '' },
    ];
    const eff = computeEffectiveShadowClasses('ring-2 ring-indigo-500', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    const ringLayer = layers.find(l => l.type === 'ring');
    expect(ringLayer).toBeDefined();
    expect(ringLayer?.sizeClass).toBe('ring-2');
    expect(ringLayer?.colorClass).toBeNull();
  });
});

describe('computeEffectiveShadowClasses — size removal (× button)', () => {
  it('size class removal makes the shadow row disappear (ghost row)', () => {
    // When the user clicks × to remove the entire shadow layer, the size class removal
    // patch should cause the whole type to be absent from effective classes.
    const patches: StagedPatch[] = [
      { property: 'shadow', originalClass: 'shadow-sm', newClass: '' },
    ];
    const eff = computeEffectiveShadowClasses('shadow-sm shadow-blue-500', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    expect(layers.find(l => l.type === 'shadow')).toBeUndefined();
  });

  it('size-only layer removal makes the shadow row disappear', () => {
    const patches: StagedPatch[] = [
      { property: 'shadow', originalClass: 'shadow-md', newClass: '' },
    ];
    const eff = computeEffectiveShadowClasses('shadow-md', patches);
    expect(parsedClassesToShadowLayers(eff, null).find(l => l.type === 'shadow')).toBeUndefined();
  });
});

describe('computeEffectiveShadowClasses — add via + button', () => {
  it('adds shadow-md when originalClass is empty', () => {
    const patches: StagedPatch[] = [{ property: 'shadow', originalClass: '', newClass: 'shadow-md' }];
    const eff = computeEffectiveShadowClasses('', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    expect(layers.find(l => l.type === 'shadow')?.sizeClass).toBe('shadow-md');
  });
});

describe('computeEffectiveShadowClasses — cross-element contamination', () => {
  it('does not apply another element shadow removal to the current element', () => {
    // Card staged a shadow-sm removal — patches are pre-filtered by elementKey in Picker.tsx
    // so computeEffectiveShadowClasses should receive NO patches for a different element
    const patches: StagedPatch[] = [];
    const eff = computeEffectiveShadowClasses('shadow-sm', patches);
    const layer = parsedClassesToShadowLayers(eff, null).find(l => l.type === 'shadow');
    expect(layer).toBeDefined();
    expect(layer?.sizeClass).toBe('shadow-sm');
  });
});

// === text-shadow ===

describe('parsedClassesToShadowLayers — text-shadow', () => {
  it('parses text-shadow-md into a text-shadow layer with sizeClass', () => {
    const layers = parsedClassesToShadowLayers('text-shadow-md', null);
    const layer = layers.find(l => l.type === 'text-shadow');
    expect(layer).toBeDefined();
    expect(layer?.sizeClass).toBe('text-shadow-md');
    expect(layer?.colorClass).toBeNull();
  });

  it('parses text-shadow-md text-shadow-blue-500 into one text-shadow layer with both classes', () => {
    const layers = parsedClassesToShadowLayers('text-shadow-md text-shadow-blue-500', null);
    const layer = layers.find(l => l.type === 'text-shadow');
    expect(layer).toBeDefined();
    expect(layer?.sizeClass).toBe('text-shadow-md');
    expect(layer?.colorClass).toBe('text-shadow-blue-500');
  });

  it('parses text-shadow independently from shadow', () => {
    const layers = parsedClassesToShadowLayers('shadow-sm text-shadow-lg', null);
    expect(layers.find(l => l.type === 'shadow')?.sizeClass).toBe('shadow-sm');
    expect(layers.find(l => l.type === 'text-shadow')?.sizeClass).toBe('text-shadow-lg');
  });
});

describe('computeEffectiveShadowClasses — text-shadow staging', () => {
  it('applies a text-shadow size patch: text-shadow-sm → text-shadow-lg', () => {
    const patches: StagedPatch[] = [{ property: 'text-shadow-size', originalClass: 'text-shadow-sm', newClass: 'text-shadow-lg' }];
    const eff = computeEffectiveShadowClasses('text-shadow-sm', patches);
    const layers = parsedClassesToShadowLayers(eff, null);
    expect(layers.find(l => l.type === 'text-shadow')?.sizeClass).toBe('text-shadow-lg');
  });

  it('removes text-shadow layer when size patch removes the only class', () => {
    const patches: StagedPatch[] = [{ property: 'text-shadow-size', originalClass: 'text-shadow-md', newClass: '' }];
    const eff = computeEffectiveShadowClasses('text-shadow-md', patches);
    expect(parsedClassesToShadowLayers(eff, null).find(l => l.type === 'text-shadow')).toBeUndefined();
  });

  it('adds text-shadow-md via + button (empty originalClass)', () => {
    const patches: StagedPatch[] = [{ property: 'text-shadow-size', originalClass: '', newClass: 'text-shadow-md' }];
    const eff = computeEffectiveShadowClasses('', patches);
    expect(parsedClassesToShadowLayers(eff, null).find(l => l.type === 'text-shadow')?.sizeClass).toBe('text-shadow-md');
  });

  it('color removal keeps the text-shadow size class visible', () => {
    const patches: StagedPatch[] = [{ property: 'text-shadow-color', originalClass: 'text-shadow-blue-500', newClass: '' }];
    const eff = computeEffectiveShadowClasses('text-shadow-md text-shadow-blue-500', patches);
    const layer = parsedClassesToShadowLayers(eff, null).find(l => l.type === 'text-shadow');
    expect(layer).toBeDefined();
    expect(layer?.sizeClass).toBe('text-shadow-md');
    expect(layer?.colorClass).toBeNull();
  });
});
