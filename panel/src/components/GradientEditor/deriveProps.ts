import type { GradientDirection, BackgroundMode } from '../DirectionPicker';
import type { GradientStop } from '../GradientBar';
import type { GradientEditorProps } from './types';
import type { ParsedClass } from '../../../../overlay/src/class-parser';
import type { Patch } from '../../../../shared/types';
import { resolveColorHex } from './useGradientState';

type DerivedProps = Pick<GradientEditorProps, 'direction' | 'stops' | 'mode' | 'solidColorName' | 'solidColorHex' | 'colors'>;

/**
 * Derive GradientEditor props from parsed classes + any staged patches.
 * Staged patches take precedence over DOM classes for determining gradient state.
 */
export function parsedClassesToGradientEditorProps(
  parsedClasses: ParsedClass[],
  colors: Record<string, any>,
  stagedClassChanges?: Patch[]
): DerivedProps {
  // Build "effective classes" by applying staged patches to parsed classes
  const effectiveClasses = new Map<string, boolean>();
  
  // Start with current DOM classes
  for (const cls of parsedClasses) {
    effectiveClasses.set(cls.fullClass, true);
  }

  // Apply staged patches (only class-change kind, only staged status)
  if (stagedClassChanges) {
    for (const patch of stagedClassChanges) {
      if (patch.kind === 'class-change' && patch.status === 'staged') {
        // Remove old class if it had one
        if (patch.originalClass) {
          effectiveClasses.delete(patch.originalClass);
        }
        // Add new class
        if (patch.newClass) {
          effectiveClasses.set(patch.newClass, true);
        }
      }
    }
  }

  // Direction: bg-gradient-to-{dir} → value is the dir letter(s)
  const dirClass = parsedClasses.find(c => c.prefix === 'bg-gradient-to-');
  const stagedDirClass = Array.from(effectiveClasses.keys()).find(c => c.startsWith('bg-gradient-to-'));
  const directionValue = stagedDirClass?.replace('bg-gradient-to-', '') || dirClass?.value;
  const direction: GradientDirection = (directionValue as GradientDirection) || 'r';

  // Solid bg color: bg-{color} in 'color' category (not gradient)
  // From staged, use any bg- class that's not a direction
  const allBgClasses = Array.from(effectiveClasses.keys()).filter(c => c.startsWith('bg-') && !c.startsWith('bg-gradient-to-'));
  const solidColorName = allBgClasses[0]?.replace('bg-', '') ?? null;
  
  // Strip opacity suffix (e.g. 'blue-500/50' → 'blue-500') for hex resolution only
  const solidColorNameBase = solidColorName?.split('/')[0] ?? null;
  const solidColorHex = solidColorNameBase
    ? resolveColorHex(solidColorNameBase, colors)
    : null;

  // Gradient stops (extract from any from-, via-, to- in effective classes)
  const allStops = Array.from(effectiveClasses.keys());
  const fromClasses = allStops.filter(c => c.startsWith('from-'));
  const viaClasses = allStops.filter(c => c.startsWith('via-'));
  const toClasses = allStops.filter(c => c.startsWith('to-'));

  const isGradient = !!(stagedDirClass || (fromClasses.length > 0 && toClasses.length > 0));
  const mode: BackgroundMode = isGradient ? 'gradient' : 'solid';

  const stops: GradientStop[] = [];
  if (isGradient) {
    let id = 1;
    // fromClasses are now strings like "from-blue-500"
    for (const fc of fromClasses) {
      const colorName = fc.replace('from-', '');
      const colorNameBase = colorName.split('/')[0];
      stops.push({
        id: String(id++),
        role: 'from',
        colorName,
        hex: resolveColorHex(colorNameBase, colors),
        position: null,
      });
    }
    for (const vc of viaClasses) {
      const colorName = vc.replace('via-', '');
      const colorNameBase = colorName.split('/')[0];
      stops.push({
        id: String(id++),
        role: 'via',
        colorName,
        hex: resolveColorHex(colorNameBase, colors),
        position: null,
      });
    }
    for (const tc of toClasses) {
      const colorName = tc.replace('to-', '');
      const colorNameBase = colorName.split('/')[0];
      stops.push({
        id: String(id++),
        role: 'to',
        colorName,
        hex: resolveColorHex(colorNameBase, colors),
        position: null,
      });
    }
  }

  return { direction, stops, mode, solidColorName, solidColorHex, colors };
}
