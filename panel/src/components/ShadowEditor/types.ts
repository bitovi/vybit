import {
  SHADOW_SIZES,
  INSET_SHADOW_SIZES,
  RING_WIDTHS,
  TEXT_SHADOW_SIZES,
} from '../../../../overlay/src/tailwind/scales';

export { SHADOW_SIZES, INSET_SHADOW_SIZES, RING_WIDTHS, TEXT_SHADOW_SIZES };

export type ShadowLayerType = 'shadow' | 'inset-shadow' | 'ring' | 'inset-ring' | 'text-shadow';

export interface ShadowLayerState {
  type: ShadowLayerType;
  /** Size/width classToken, e.g. "shadow-lg", "ring-2", or null if absent */
  sizeClass: string | null;
  /** Color classToken, e.g. "shadow-blue-500", "ring-red-600", or null if no explicit color */
  colorClass: string | null;
  /** Resolved hex color for the swatch, e.g. "#3b82f6", or null if no explicit color */
  colorHex: string | null;
  /** Opacity value (0–100) extracted from /N modifier, or null if no modifier */
  opacity: number | null;
  /** True when layer is explicitly "none"/"0" (shadow-none, ring-0, etc.) */
  isNone: boolean;
}

/** Display labels for each layer type */
export const LAYER_LABELS: Record<ShadowLayerType, string> = {
  'shadow': 'Shadow',
  'inset-shadow': 'Inset Shadow',
  'ring': 'Ring',
  'inset-ring': 'Inset Ring',
  'text-shadow': 'Text Shadow',
};

/** Default classToken added when user clicks [+] on a ghost row */
export const LAYER_DEFAULTS: Record<ShadowLayerType, string> = {
  'shadow': 'shadow-md',
  'inset-shadow': 'inset-shadow-sm',
  'ring': 'ring-2',
  'inset-ring': 'inset-ring-2',
  'text-shadow': 'text-shadow-md',
};

/** Get the full scale values array for a given layer type, with correct prefix */
export function getLayerScale(type: ShadowLayerType): string[] {
  switch (type) {
    case 'shadow':
      return SHADOW_SIZES.map(s => `shadow-${s}`);
    case 'inset-shadow':
      return INSET_SHADOW_SIZES.map(s => `inset-shadow-${s}`);
    case 'ring':
      return RING_WIDTHS.map(w => `ring-${w}`);
    case 'inset-ring':
      return RING_WIDTHS.map(w => `inset-ring-${w}`);
    case 'text-shadow':
      return TEXT_SHADOW_SIZES.map(s => `text-shadow-${s}`);
  }
}

/** Short display values for the scrubber (e.g. "lg", "sm", "2") */
export function getDisplayScale(type: ShadowLayerType): string[] {
  switch (type) {
    case 'shadow':
      return [...SHADOW_SIZES];
    case 'inset-shadow':
      return [...INSET_SHADOW_SIZES];
    case 'ring':
      return [...RING_WIDTHS];
    case 'inset-ring':
      return [...RING_WIDTHS];
    case 'text-shadow':
      return [...TEXT_SHADOW_SIZES];
  }
}

/** Convert a short display value back to a full class name */
export function displayToFullClass(type: ShadowLayerType, displayValue: string): string {
  const prefix = type === 'shadow' ? 'shadow-'
    : type === 'inset-shadow' ? 'inset-shadow-'
    : type === 'ring' ? 'ring-'
    : type === 'inset-ring' ? 'inset-ring-'
    : 'text-shadow-';
  return `${prefix}${displayValue}`;
}

/** Extract the short display value from a full class name */
export function fullClassToDisplay(type: ShadowLayerType, fullClass: string): string {
  const prefix = type === 'shadow' ? 'shadow-'
    : type === 'inset-shadow' ? 'inset-shadow-'
    : type === 'ring' ? 'ring-'
    : type === 'inset-ring' ? 'inset-ring-'
    : 'text-shadow-';
  return fullClass.startsWith(prefix) ? fullClass.slice(prefix.length) : fullClass;
}

/** CSS box-shadow value for the inline preview square, given a layer state */
export function layerToPreviewCSS(layer: ShadowLayerState): string {
  if (layer.isNone || !layer.sizeClass) return 'none';

  // Build a color string with opacity applied if needed
  const resolveColor = (fallback: string) => {
    if (!layer.colorHex) return fallback;
    if (layer.opacity !== null && layer.opacity < 100) {
      const a = (layer.opacity / 100).toFixed(2);
      // Convert hex to rgba
      const r = parseInt(layer.colorHex.slice(1, 3), 16);
      const g = parseInt(layer.colorHex.slice(3, 5), 16);
      const b = parseInt(layer.colorHex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    return layer.colorHex;
  };

  const color = layer.colorHex ? resolveColor(layer.colorHex) : undefined;

  // We use hardcoded approximations for the preview squares
  switch (layer.type) {
    case 'shadow': {
      const value = extractSizeValue(layer.sizeClass, 'shadow-');
      return shadowSizeToCSS(value, color);
    }
    case 'inset-shadow': {
      const value = extractSizeValue(layer.sizeClass, 'inset-shadow-');
      return insetShadowSizeToCSS(value, color);
    }
    case 'ring': {
      const width = extractSizeValue(layer.sizeClass, 'ring-');
      const px = width === '0' ? 0 : Number(width) || 1;
      const c = color ?? 'rgba(99,102,241,0.5)';
      return `0 0 0 ${px}px ${c}`;
    }
    case 'inset-ring': {
      const width = extractSizeValue(layer.sizeClass, 'inset-ring-');
      const px = width === '0' ? 0 : Number(width) || 1;
      const c = color ?? 'rgba(99,102,241,0.5)';
      return `inset 0 0 0 ${px}px ${c}`;
    }
    case 'text-shadow':
      // text-shadow uses textShadow CSS, not boxShadow — return none for the box preview
      return 'none';
  }
}

/** CSS text-shadow value for the inline text preview, given a text-shadow layer state */
export function layerToPreviewTextShadowCSS(layer: ShadowLayerState): string {
  if (layer.isNone || !layer.sizeClass) return 'none';

  const resolveColor = (fallback: string) => {
    if (!layer.colorHex) return fallback;
    if (layer.opacity !== null && layer.opacity < 100) {
      const a = (layer.opacity / 100).toFixed(2);
      const r = parseInt(layer.colorHex.slice(1, 3), 16);
      const g = parseInt(layer.colorHex.slice(3, 5), 16);
      const b = parseInt(layer.colorHex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    return layer.colorHex;
  };

  const c = layer.colorHex ? resolveColor(layer.colorHex) : undefined;
  const size = extractSizeValue(layer.sizeClass, 'text-shadow-');
  return textShadowSizeToCSS(size, c);
}

function textShadowSizeToCSS(size: string, color?: string): string {
  const c = color ?? 'rgba(0,0,0,0.25)';
  const shadows: Record<string, string> = {
    '2xs': `0 1px 0 ${c}`,
    'xs':  `0 1px 1px ${c}`,
    'sm':  `0 1px 2px ${c}`,
    'md':  `0 2px 4px ${c}`,
    'lg':  `0 4px 6px ${c}`,
  };
  return shadows[size] ?? 'none';
}

function extractSizeValue(sizeClass: string, prefix: string): string {
  return sizeClass.startsWith(prefix) ? sizeClass.slice(prefix.length) : sizeClass;
}

function shadowSizeToCSS(size: string, color?: string): string {
  const c = color ?? 'rgba(0,0,0,0.15)';
  const shadows: Record<string, string> = {
    '2xs': `0 1px ${c}`,
    'xs': `0 1px 2px 0 ${c}`,
    'sm': `0 1px 3px 0 ${c}, 0 1px 2px -1px ${c}`,
    'md': `0 4px 6px -1px ${c}, 0 2px 4px -2px ${c}`,
    'lg': `0 10px 15px -3px ${c}, 0 4px 6px -4px ${c}`,
    'xl': `0 20px 25px -5px ${c}, 0 8px 10px -6px ${c}`,
    '2xl': `0 25px 50px -12px ${c}`,
  };
  return shadows[size] ?? 'none';
}

function insetShadowSizeToCSS(size: string, color?: string): string {
  const c = color ?? 'rgba(0,0,0,0.05)';
  const shadows: Record<string, string> = {
    '2xs': `inset 0 0.5px ${c}`,
    'xs': `inset 0 1px 1px ${c}`,
    'sm': `inset 0 2px 4px ${c}`,
  };
  return shadows[size] ?? 'none';
}

export interface ShadowEditorProps {
  /** Current state for each active layer */
  layers: ShadowLayerState[];
  /** Called to preview a class change (hover) */
  onPreview: (oldClass: string, newClass: string) => void;
  /** Called to revert an active preview */
  onRevert: () => void;
  /** Called to stage (commit) a class change */
  onStage: (oldClass: string, newClass: string) => void;
  /** Called to add a new layer with a default value */
  onAdd: (defaultClass: string) => void;
  /** Called to remove all classes for a layer */
  onRemove: (classes: string[]) => void;
  /** Called when hovering removal (preview empty) */
  onRemoveHover: (classes: string[]) => void;
  /** Called when the color swatch is clicked — parent opens a color picker */
  onColorClick?: (layer: ShadowLayerState, anchorEl: Element) => void;
}

export interface ShadowLayerRowProps {
  layer: ShadowLayerState;
  onSizeHover: (value: string) => void;
  onSizeLeave: () => void;
  onSizeClick: (value: string) => void;
  onColorClick: (anchorEl: Element) => void;
  onOpacityHover: (value: string) => void;
  onOpacityLeave: () => void;
  onOpacityClick: (value: string) => void;
  onRemove: () => void;
  onRemoveHover: () => void;
}
