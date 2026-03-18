import type { GradientDirection, BackgroundMode } from '../DirectionPicker';
import type { GradientStop } from '../GradientBar';
import type { GradientEditorProps } from './types';
import type { ParsedClass } from '../../../../overlay/src/class-parser';
import { resolveColorHex } from './useGradientState';

type DerivedProps = Pick<GradientEditorProps, 'direction' | 'stops' | 'mode' | 'solidColorName' | 'solidColorHex' | 'colors'>;

export function parsedClassesToGradientEditorProps(
  parsedClasses: ParsedClass[],
  colors: Record<string, any>
): DerivedProps {
  // Direction: bg-gradient-to-{dir} → value is the dir letter(s)
  const dirClass = parsedClasses.find(c => c.prefix === 'bg-gradient-to-');
  const direction: GradientDirection = (dirClass?.value as GradientDirection) ?? 'r';

  // Solid bg color: bg-{color} in 'color' category (not gradient)
  const solidBgClass = parsedClasses.find(
    c => c.prefix === 'bg-' && c.category === 'color'
  );
  const solidColorName = solidBgClass?.value ?? null;
  // Strip opacity suffix (e.g. 'blue-500/50' → 'blue-500') for hex resolution only
  const solidColorNameBase = solidColorName?.split('/')[0] ?? null;
  const solidColorHex = solidColorNameBase
    ? resolveColorHex(solidColorNameBase, colors)
    : null;

  // Gradient stops
  const fromClasses = parsedClasses.filter(c => c.prefix === 'from-' && c.category === 'gradient');
  const viaClasses = parsedClasses.filter(c => c.prefix === 'via-' && c.category === 'gradient');
  const toClasses = parsedClasses.filter(c => c.prefix === 'to-' && c.category === 'gradient');

  const isGradient = !!(dirClass || (fromClasses.length > 0 && toClasses.length > 0));
  const mode: BackgroundMode = isGradient ? 'gradient' : 'solid';

  const stops: GradientStop[] = [];
  if (isGradient) {
    let id = 1;
    for (const fc of fromClasses) {
      const colorName = fc.value;
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
      const colorName = vc.value;
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
      const colorName = tc.value;
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
