/** Which layer of the box model */
export type LayerName = 'margin' | 'outline' | 'border' | 'padding';

/** How Tailwind classes are distributed for a given layer */
export type ClassState = 'none' | 'shorthand' | 'axis' | 'individual' | 'mixed';

/** Direction keys for the 4 sides + 2 axes */
export type SlotDirection = 't' | 'r' | 'b' | 'l' | 'x' | 'y';

/** Extra slot types on border and outline layers */
export type ExtraSlot = 'color' | 'style' | 'offset';

/** All possible slot keys */
export type SlotKey = SlotDirection | ExtraSlot;

/** Per-layer color palette */
export interface LayerColors {
  fill: string;
  accent: string;
  label: string;
  labelHover: string;
}

/** Resolved state for one slot */
export interface SlotData {
  key: SlotKey;
  /** Full Tailwind class if set, e.g. "pt-10", or null if empty */
  value: string | null;
  /** Display label when no value: "t", "x", "color", etc. */
  placeholder: string;
  /** Scale values for scrubber (when provided, slot becomes interactive) */
  scaleValues?: string[];
}

/** Resolved state for one layer, derived from ParsedClass[] */
export interface LayerState {
  layer: LayerName;
  classState: ClassState;
  /** The shorthand class if it exists, e.g. "p-2". Null when classState is none/individual */
  shorthandValue: string | null;
  /** All slots for this layer with their resolved values */
  slots: SlotData[];
  /** Scale values for the shorthand scrubber (e.g. ["p-0","p-1",...]) */
  shorthandScaleValues?: string[];
}

/** Props for the top-level BoxModel component */
export interface BoxModelProps {
  /** Per-layer resolved states (typically 4: margin, outline, border, padding) */
  layers: LayerState[];
  /** When true, the entire box model is frozen (scrubber active) */
  frozen?: boolean;
  /** Called when user clicks a slot or label to begin editing */
  onSlotClick?: (layer: LayerName, slotKey: SlotKey | 'shorthand', anchorEl?: Element) => void;
  /** Called when user commits a new value via scrubber */
  onSlotChange?: (layer: LayerName, slotKey: SlotKey | 'shorthand', value: string) => void;
  /** Called when user hovers a candidate value (for preview), null on leave */
  onSlotHover?: (layer: LayerName, slotKey: SlotKey | 'shorthand', value: string | null) => void;
  /** Called when the user starts interacting with any slot (scrub or dropdown open) */
  onEditStart?: () => void;
}

/** Props for a single ring */
export interface BoxModelRingProps {
  layer: LayerName;
  classState: ClassState;
  shorthandValue: string | null;
  slots: SlotData[];
  /** Is this specific ring the one directly hovered? */
  isHovered: boolean;
  /** Is the entire box model frozen (editing in progress)? */
  frozen: boolean;
  /** Called when this ring's hover state changes */
  onHoverChange: (hovered: boolean) => void;
  /** Called when a slot or the shorthand label is clicked */
  onSlotClick?: (slotKey: SlotKey | 'shorthand', anchorEl?: Element) => void;
  /** Called when a slot value is committed via scrubber */
  onSlotChange?: (slotKey: SlotKey | 'shorthand', value: string) => void;
  /** Called when a slot value is previewed (hover/scrub), null on leave */
  onSlotHover?: (slotKey: SlotKey | 'shorthand', value: string | null) => void;
  /** Called when any slot starts scrubbing */
  onScrubStart?: () => void;
  /** Called when scrubbing ends */
  onScrubEnd?: () => void;
  /** Called when a slot's dropdown opens */
  onSlotOpen?: () => void;
  /** Called when a slot's dropdown closes */
  onSlotClose?: () => void;
  /** Content (next inner ring or content box) */
  children?: React.ReactNode;
}

/** Props for a single slot item */
export interface BoxModelSlotProps {
  /** The slot key (direction or special type) */
  slotKey: SlotKey;
  /** Full Tailwind class value if set, e.g. "t-10" */
  value: string | null;
  /** Text to show when no value: "t", "x", "color", etc. */
  placeholder: string;
  /** Which layer this slot belongs to (for accent colors) */
  layer: LayerName;
  /** Is the parent ring currently expanded? */
  isExpanded: boolean;
  /** Is the box model frozen for editing? */
  frozen: boolean;
  /** Scale values for inline scrubber (optional) */
  scaleValues?: string[];
  /** Drag axis when scrubbing: 'x' horizontal, 'y' vertical */
  axis?: 'x' | 'y';
  /** Click handler (plain slot mode) */
  onClick?: (anchorEl: Element) => void;
  /** Called when user commits a value via scrubber */
  onValueChange?: (value: string) => void;
  /** Called when user previews a value via scrubber */
  onValueHover?: (value: string) => void;
  /** Called when scrubber preview ends */
  onValueLeave?: () => void;
  /** Called when scrubbing starts */
  onScrubStart?: () => void;
  /** Called when scrubbing ends */
  onScrubEnd?: () => void;
  /** Called when this slot's dropdown opens */
  onOpen?: () => void;
  /** Called when this slot's dropdown closes */
  onClose?: () => void;
}
