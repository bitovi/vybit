import type { LayerName, LayerColors, LayerState, SlotData, ClassState, SlotKey } from './types';
import type { ParsedClass } from '../../../../overlay/src/class-parser';

/** Color palette per layer — matches box-model-hover-grow.html prototype */
export const LAYER_COLORS: Record<LayerName, LayerColors> = {
  margin: {
    fill: 'rgba(245, 83, 45, 0.10)',
    accent: '#C73D1A',
    label: 'rgba(185, 55, 20, 0.35)',
    labelHover: 'rgba(185, 55, 20, 0.60)',
  },
  outline: {
    fill: 'rgba(139, 79, 240, 0.10)',
    accent: '#6932C3',
    label: 'rgba(105, 50, 195, 0.35)',
    labelHover: 'rgba(105, 50, 195, 0.60)',
  },
  border: {
    fill: 'rgba(56, 120, 245, 0.10)',
    accent: '#1950D2',
    label: 'rgba(25, 80, 210, 0.35)',
    labelHover: 'rgba(25, 80, 210, 0.60)',
  },
  padding: {
    fill: 'rgba(0, 132, 139, 0.12)',
    accent: '#005A5F',
    label: 'rgba(0, 90, 95, 0.35)',
    labelHover: 'rgba(0, 90, 95, 0.60)',
  },
};

/** Maps layer names to their Tailwind class prefixes */
const LAYER_PREFIXES: Record<LayerName, {
  shorthand: string;
  x: string;
  y: string;
  t: string;
  r: string;
  b: string;
  l: string;
}> = {
  margin:  { shorthand: 'm',  x: 'mx', y: 'my', t: 'mt', r: 'mr', b: 'mb', l: 'ml' },
  outline: { shorthand: 'outline', x: 'outline-x', y: 'outline-y', t: 'outline-t', r: 'outline-r', b: 'outline-b', l: 'outline-l' },
  border:  { shorthand: 'border', x: 'border-x', y: 'border-y', t: 'border-t', r: 'border-r', b: 'border-b', l: 'border-l' },
  padding: { shorthand: 'p',  x: 'px', y: 'py', t: 'pt', r: 'pr', b: 'pb', l: 'pl' },
};

/** Standard directional slots for margin, border, padding */
const DIRECTIONAL_SLOTS: SlotKey[] = ['y', 't', 'r', 'b', 'x', 'l'];

/** Slot configurations per layer */
export function getSlotsForLayer(layer: LayerName): { key: SlotKey; placeholder: string }[] {
  const slots: { key: SlotKey; placeholder: string }[] = DIRECTIONAL_SLOTS.map(k => ({
    key: k,
    placeholder: k,
  }));
  if (layer === 'border' || layer === 'outline') {
    slots.push(
      { key: 'color', placeholder: 'color' },
      { key: 'style', placeholder: 'style' },
    );
  }
  if (layer === 'outline') {
    slots.push({ key: 'offset', placeholder: 'offset' });
  }
  return slots;
}

/**
 * Simplified class value extraction.
 * Given a flat map of prefix→value (e.g. { "p": "2", "pt": "5" }),
 * derive the LayerState for one layer.
 */
export function deriveLayerState(
  layer: LayerName,
  classMap: Record<string, string>,
): LayerState {
  const prefixes = LAYER_PREFIXES[layer];
  const slotDefs = getSlotsForLayer(layer);

  // Look up shorthand
  const shorthandRaw = classMap[prefixes.shorthand] ?? null;
  const shorthandValue = shorthandRaw != null
    ? (shorthandRaw === '' ? prefixes.shorthand : `${prefixes.shorthand}-${shorthandRaw}`)
    : null;

  // Look up per-slot values
  const slots: SlotData[] = slotDefs.map(({ key, placeholder }) => {
    let prefix: string | undefined;
    if (key === 'color') {
      const colorPrefix = layer === 'outline' ? 'outline-color' : 'border-color';
      prefix = colorPrefix in classMap ? colorPrefix : undefined;
    } else if (key === 'style') {
      const stylePrefix = layer === 'outline' ? 'outline-style' : 'border-style';
      prefix = stylePrefix in classMap ? stylePrefix : undefined;
    } else if (key === 'offset') {
      prefix = 'outline-offset' in classMap ? 'outline-offset' : undefined;
    } else {
      prefix = prefixes[key as keyof typeof prefixes];
    }

    const rawVal = prefix ? classMap[prefix] ?? null : null;

    // Color/style slots use classMap keys like 'border-color' / 'border-style',
    // but the real Tailwind class is  border-{value}  (not border-color-{value}).
    let value: string | null;
    if ((key === 'color' || key === 'style') && rawVal != null) {
      const layerPrefix = layer === 'outline' ? 'outline' : 'border';
      value = `${layerPrefix}-${rawVal}`;
    } else {
      value = rawVal != null && prefix ? `${prefix}-${rawVal}` : null;
    }

    return { key, value, placeholder };
  });

  // Determine classState
  const hasShorthand = shorthandValue != null;
  const hasAxis = slots.some(s => (s.key === 'x' || s.key === 'y') && s.value != null);
  const hasSide = slots.some(s => (s.key === 't' || s.key === 'r' || s.key === 'b' || s.key === 'l') && s.value != null);
  const hasAny = hasAxis || hasSide;

  let classState: ClassState;
  if (!hasShorthand && !hasAny) {
    classState = 'none';
  } else if (hasShorthand && !hasAny) {
    classState = 'shorthand';
  } else if (!hasShorthand && hasAxis && !hasSide) {
    classState = 'axis';
  } else if (!hasShorthand) {
    classState = 'individual';
  } else {
    classState = 'mixed';
  }

  return { layer, classState, shorthandValue, slots };
}

/** Spacing scale steps (Tailwind default) */
const SPACING_STEPS = ['px', '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96'];
const BORDER_WIDTH_STEPS = [ '0', '', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32', '40', '48', '56', '64'];

const BORDER_STYLE_STEPS = ['solid', 'dashed', 'dotted', 'double', 'hidden', 'none'];

function getSlotScaleValues(layer: LayerName, slotKey: SlotKey, tailwindConfig?: any): string[] {
  if (slotKey === 'color') return [];

  if (slotKey === 'style') {
    const prefix = layer === 'outline' ? 'outline' : 'border';
    return BORDER_STYLE_STEPS.map(s => `${prefix}-${s}`);
  }

  // Use tailwindConfig spacing if available
  let steps: string[];
  if (layer === 'border' || layer === 'outline') {
    if (slotKey === 'offset') {
      steps = tailwindConfig?.theme?.spacing
        ? Object.keys(tailwindConfig.theme.spacing)
        : SPACING_STEPS;
    } else {
      steps = tailwindConfig?.theme?.borderWidth
        ? Object.keys(tailwindConfig.theme.borderWidth)
        : BORDER_WIDTH_STEPS;
    }
  } else {
    steps = tailwindConfig?.theme?.spacing
      ? Object.keys(tailwindConfig.theme.spacing)
      : SPACING_STEPS;
  }

  const prefixMap: Record<LayerName, Partial<Record<SlotKey, string>>> = {
    margin:  { shorthand: 'm', t: 'mt', r: 'mr', b: 'mb', l: 'ml', x: 'mx', y: 'my' } as any,
    padding: { shorthand: 'p', t: 'pt', r: 'pr', b: 'pb', l: 'pl', x: 'px', y: 'py' } as any,
    border:  { t: 'border-t', r: 'border-r', b: 'border-b', l: 'border-l', x: 'border-x', y: 'border-y', offset: 'outline-offset' } as any,
    outline: { t: 'outline-t', r: 'outline-r', b: 'outline-b', l: 'outline-l', x: 'outline-x', y: 'outline-y', offset: 'outline-offset' } as any,
  };
  const prefix = prefixMap[layer][slotKey];
  if (!prefix) return [];
  return steps.map(s => s === '' ? prefix : `${prefix}-${s}`);
}

/**
 * Build LayerState[] for all 4 box-model layers from a ParsedClass array.
 * Each slot that supports scrubbing will have scaleValues attached.
 */
export function boxModelLayersFromClasses(
  parsedClasses: ParsedClass[],
  tailwindConfig?: any,
): LayerState[] {
  // Build a classMap: prefix → value  (e.g. "pt" → "5")
  const classMap: Record<string, string> = {};
  for (const cls of parsedClasses) {
    // ParsedClass.prefix includes a trailing dash (e.g. "px-") — strip it so it
    // matches the keys in LAYER_PREFIXES (e.g. "px").
    let key = cls.prefix.replace(/-$/, '');

    // border-{color} and border-{style} share the 'border-' prefix with border
    // width, but deriveLayerState expects them under 'border-color' / 'border-style'.
    if (key === 'border' && cls.themeKey === 'colors') {
      key = 'border-color';
    } else if (key === 'border' && cls.themeKey === null && cls.valueType === 'enum') {
      key = 'border-style';
    } else if (key === 'outline' && cls.themeKey === 'colors') {
      key = 'outline-color';
    }

    classMap[key] = cls.value;
  }

  // Shorthand prefix and step source per layer
  const shorthandPrefix: Record<LayerName, string> = {
    margin: 'm', padding: 'p', border: 'border', outline: 'outline',
  };
  const shorthandUseBorderSteps: Record<LayerName, boolean> = {
    margin: false, padding: false, border: true, outline: false,
  };

  const layers: LayerName[] = ['margin', 'outline', 'border', 'padding'];
  return layers.map(layer => {
    const state = deriveLayerState(layer, classMap);
    // Attach scaleValues to each slot
    const slots: SlotData[] = state.slots.map(slot => {
      const scaleValues = getSlotScaleValues(layer, slot.key, tailwindConfig);
      return scaleValues.length > 0 ? { ...slot, scaleValues } : slot;
    });
    // Build shorthand scale values
    const shSteps = shorthandUseBorderSteps[layer]
      ? (tailwindConfig?.theme?.borderWidth ? Object.keys(tailwindConfig.theme.borderWidth) : BORDER_WIDTH_STEPS)
      : (tailwindConfig?.theme?.spacing ? Object.keys(tailwindConfig.theme.spacing) : SPACING_STEPS);
    const shorthandScaleValues = shSteps.map(s => s === '' ? shorthandPrefix[layer] : `${shorthandPrefix[layer]}-${s}`);
    return { ...state, slots, shorthandScaleValues };
  });
}
