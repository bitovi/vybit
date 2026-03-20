/**
 * Shared logic for computing effective shadow/ring classes from raw classes + staged patches.
 * Extracted here so it can be unit-tested independently of Picker.tsx.
 */

import type { ShadowLayerState, ShadowLayerType } from './types';
import {
  SHADOW_SIZE_SET,
  INSET_SHADOW_SIZE_SET,
  RING_WIDTH_SET,
  TEXT_SHADOW_SIZE_SET,
} from '../../../../overlay/src/tailwind/scales';

export {
  SHADOW_SIZE_SET,
  INSET_SHADOW_SIZE_SET,
  RING_WIDTH_SET,
  TEXT_SHADOW_SIZE_SET,
} from '../../../../overlay/src/tailwind/scales';

export {
  SHADOW_SIZES,
  INSET_SHADOW_SIZES,
  RING_WIDTHS,
  TEXT_SHADOW_SIZES,
} from '../../../../overlay/src/tailwind/scales';

export const SHADOW_TYPE_CONFIGS = [
  { prop: 'shadow',       prefix: 'shadow-',       sizeSet: SHADOW_SIZE_SET },
  { prop: 'inset-shadow', prefix: 'inset-shadow-', sizeSet: INSET_SHADOW_SIZE_SET },
  { prop: 'ring',         prefix: 'ring-',         sizeSet: RING_WIDTH_SET },
  { prop: 'inset-ring',   prefix: 'inset-ring-',   sizeSet: RING_WIDTH_SET },
  { prop: 'text-shadow',  prefix: 'text-shadow-',  sizeSet: TEXT_SHADOW_SIZE_SET },
] as const;

export type ShadowProp = 'shadow' | 'inset-shadow' | 'ring' | 'inset-ring' | 'text-shadow';

export interface StagedPatch {
  property: string;
  originalClass: string;
  newClass: string;
}

/**
 * Apply a single staged patch to a set of raw classes for one shadow type.
 * Handles three cases:
 *   1. originalClass found in typeClasses: direct replace/remove
 *   2. originalClass not found, typeClasses empty: was added via +, now modified — use newClass
 *   3. originalClass not found, typeClasses non-empty: changed twice on a DOM class —
 *      find the same-category (size vs color) class and replace it
 */
export function applyShadowTypePatch(
  typeClasses: string[],
  originalClass: string,
  newClass: string,
  prefix: string,
  sizeSet: ReadonlySet<string>,
): string[] {
  if (!originalClass) {
    return newClass ? [...typeClasses, newClass] : typeClasses;
  }
  if (typeClasses.includes(originalClass)) {
    if (!newClass) return typeClasses.filter(c => c !== originalClass);
    return typeClasses.map(c => c === originalClass ? newClass : c);
  }
  // originalClass was from a previously-staged change (not in raw DOM)
  if (typeClasses.length === 0) {
    return newClass ? [newClass] : [];
  }
  // Has raw classes: find same category (size vs color) and replace
  const origSuffix = originalClass.startsWith(prefix) ? originalClass.slice(prefix.length).split('/')[0] : '';
  const origIsSize = sizeSet.has(origSuffix);
  let replaced = false;
  const updated = typeClasses.flatMap(c => {
    const sfx = c.startsWith(prefix) ? c.slice(prefix.length).split('/')[0] : '';
    if (sizeSet.has(sfx) === origIsSize && !replaced) {
      replaced = true;
      return newClass ? [newClass] : [];
    }
    return [c];
  });
  if (replaced) return updated;
  return newClass ? [...typeClasses, newClass] : typeClasses;
}

/** Resolve a Tailwind color class suffix (e.g. "blue-500") to a hex string. */
function resolveColorHex(colorSuffix: string, colors: Record<string, unknown> | null | undefined): string | null {
  if (!colors) return null;
  const lastDash = colorSuffix.lastIndexOf('-');
  if (lastDash === -1) {
    const hex = colors[colorSuffix];
    return typeof hex === 'string' ? hex : null;
  }
  const name = colorSuffix.slice(0, lastDash);
  const shade = colorSuffix.slice(lastDash + 1);
  const group = colors[name] as Record<string, unknown> | string | undefined;
  if (!group) return null;
  if (typeof group === 'string') return group;
  const hex = (group as Record<string, unknown>)[shade];
  return typeof hex === 'string' ? hex : null;
}

/** Build ShadowLayerState[] from the raw class string without relying on grammar parsers. */
export function parsedClassesToShadowLayers(rawClasses: string, tailwindConfig: { colors?: Record<string, unknown> } | null | undefined): ShadowLayerState[] {
  const classes = rawClasses.trim().split(/\s+/).filter(Boolean);
  const colors = tailwindConfig?.colors;

  const configs: { type: ShadowLayerType; prefix: string; sizeSet: Set<string> }[] = [
    { type: 'shadow',       prefix: 'shadow-',       sizeSet: SHADOW_SIZE_SET },
    { type: 'inset-shadow', prefix: 'inset-shadow-', sizeSet: INSET_SHADOW_SIZE_SET },
    { type: 'ring',         prefix: 'ring-',         sizeSet: RING_WIDTH_SET },
    { type: 'inset-ring',   prefix: 'inset-ring-',   sizeSet: RING_WIDTH_SET },
    { type: 'text-shadow',  prefix: 'text-shadow-',  sizeSet: TEXT_SHADOW_SIZE_SET },
  ];

  const result: ShadowLayerState[] = [];
  for (const { type, prefix, sizeSet } of configs) {
    const matching = classes.filter(cls => cls === prefix.slice(0, -1) || cls.startsWith(prefix));
    if (matching.length === 0) continue;

    let sizeClass: string | null = null;
    let colorClass: string | null = null;
    let colorHex: string | null = null;
    let opacity: number | null = null;

    for (const cls of matching) {
      const suffix = cls.slice(prefix.length);
      const baseSuffix = suffix.split('/')[0];
      if (sizeSet.has(baseSuffix)) {
        sizeClass = cls;
      } else {
        colorClass = cls;
        const parts = cls.split('/');
        if (parts.length === 2) opacity = parseInt(parts[1]);
        colorHex = resolveColorHex(baseSuffix, colors ?? null);
      }
    }

    result.push({
      type,
      sizeClass,
      colorClass,
      colorHex,
      opacity,
      isNone: sizeClass !== null && (sizeClass.endsWith('-none') || sizeClass.endsWith('-0')),
    });
  }
  return result;
}

/**
 * Compute effective shadow-related classes by applying staged patches on top of raw classes.
 *
 * Each shadow type (shadow, inset-shadow, ring, inset-ring, text-shadow) is represented by up to
 * two Tailwind classes: a SIZE class (e.g. `shadow-md`) and an optional COLOR class
 * (e.g. `shadow-blue-500`). They share a prefix but must be patched independently — the user can
 * change color without touching size and vice versa.
 *
 * The size class "owns" the color class: if the size is removed (e.g. user clicks ×), the entire
 * shadow type must disappear from the output — including any orphaned color class that would
 * otherwise remain. If only the color is removed, the size class stays.
 *
 * This asymmetric removal rule — same `newClass = ''` signal, different meaning depending on
 * whether `originalClass` is a size or color class — is why simple per-property `resolvePropertyState`
 * can't handle shadows. Both classes must be considered together.
 *
 * All five shadow types are processed in one pass so their classes can be emitted back into a
 * single coherent class string alongside unrelated classes (e.g. `flex`, `p-4`).
 */
export function computeEffectiveShadowClasses(rawClasses: string, stagedPatches: StagedPatch[]): string {
  const SHADOW_PROPS = new Set(['shadow', 'inset-shadow', 'ring', 'inset-ring', 'text-shadow', 'shadow-size', 'shadow-color', 'inset-shadow-size', 'inset-shadow-color', 'ring-size', 'ring-color', 'inset-ring-size', 'inset-ring-color', 'text-shadow-size', 'text-shadow-color']);
  const shadowPatches = stagedPatches.filter(p => SHADOW_PROPS.has(p.property));
  const rawClassList = rawClasses.trim().split(/\s+/).filter(Boolean);

  // Start with non-shadow classes, then add per-type effective classes
  const effectiveClassList: string[] = rawClassList.filter(
    cls => !SHADOW_TYPE_CONFIGS.some(({ prefix }) => cls === prefix.slice(0, -1) || cls.startsWith(prefix))
  );

  for (const { prop, prefix, sizeSet } of SHADOW_TYPE_CONFIGS) {
    // Look for patches with either the base property name or the -size/-color variants
    const baseTypePatch = shadowPatches.find(p => p.property === prop);
    const sizeTypePatch = shadowPatches.find(p => p.property === `${prop}-size`);
    const colorTypePatch = shadowPatches.find(p => p.property === `${prop}-color`);
    
    const typeRaw = rawClassList.filter(cls => cls === prefix.slice(0, -1) || cls.startsWith(prefix));

    // If there's a base patch (old-style), use it alone
    if (baseTypePatch) {
      if (!baseTypePatch.newClass) {
        // Removal patch (newClass = ''). Distinguish between:
        //   - Size class removal → the whole shadow type disappears (ghost row intent)
        //   - Color class removal → only the color class is removed; size class remains
        const origSuffix = baseTypePatch.originalClass.startsWith(prefix)
          ? baseTypePatch.originalClass.slice(prefix.length).split('/')[0]
          : '';
        const isOrigSizeClass = sizeSet.has(origSuffix);
        if (isOrigSizeClass || !baseTypePatch.originalClass) {
          // Size class (or sentinel "all") removal — contribute nothing, making the type a ghost row
        } else {
          // Color class removal — remove only the color, keep size classes
          effectiveClassList.push(...applyShadowTypePatch(typeRaw, baseTypePatch.originalClass, baseTypePatch.newClass, prefix, sizeSet));
        }
      } else {
        effectiveClassList.push(...applyShadowTypePatch(typeRaw, baseTypePatch.originalClass, baseTypePatch.newClass, prefix, sizeSet));
      }
      continue;
    }

    // Handle new-style size and color patches separately
    let effectiveClasses = [...typeRaw];

    // Apply size patch first
    if (sizeTypePatch) {
      if (!sizeTypePatch.newClass) {
        // Size removal makes the type ghost
        if (!sizeTypePatch.originalClass) {
          // Sentinel removal, skip
        } else {
          // Remove the size class but keep any color classes
          effectiveClasses = applyShadowTypePatch(effectiveClasses, sizeTypePatch.originalClass, '', prefix, sizeSet);
        }
      } else {
        effectiveClasses = applyShadowTypePatch(effectiveClasses, sizeTypePatch.originalClass, sizeTypePatch.newClass, prefix, sizeSet);
      }
    }

    // Then apply color patch
    if (colorTypePatch) {
      if (!colorTypePatch.newClass) {
        // Color removal
        if (colorTypePatch.originalClass) {
          effectiveClasses = applyShadowTypePatch(effectiveClasses, colorTypePatch.originalClass, '', prefix, sizeSet);
        }
      } else {
        effectiveClasses = applyShadowTypePatch(effectiveClasses, colorTypePatch.originalClass, colorTypePatch.newClass, prefix, sizeSet);
      }
    }

    effectiveClassList.push(...effectiveClasses);
  }

  return effectiveClassList.join(' ');
}
