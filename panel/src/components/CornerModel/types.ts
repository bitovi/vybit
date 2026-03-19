/**
 * A corner key — matches Tailwind's rounded-{corner} suffixes.
 * 'all' represents the shorthand (rounded-*) with no corner qualifier.
 */
export type CornerKey = 'tl' | 'tr' | 'br' | 'bl';

/**
 * A side key — matches Tailwind's rounded-{side}-* suffixes.
 * Each side controls two adjacent corners:
 *   t → tl + tr,  r → tr + br,  b → br + bl,  l → tl + bl
 */
export type SideKey = 't' | 'r' | 'b' | 'l';

/** Every slot in the grid */
export type SlotKey = 'all' | SideKey | CornerKey;

/** A single slot's resolved state */
export interface CornerSlotData {
  key: SlotKey;
  /** Full Tailwind class if set, e.g. "rounded-lg", or null if empty */
  value: string | null;
  /** Display label when no value */
  placeholder: string;
  /** Scale values for the scrubber (e.g. ["rounded-none","rounded-sm",...]) */
  scaleValues?: string[];
}

/** The full state passed into CornerModel */
export interface CornerModelState {
  /** The shorthand class if it exists, e.g. "rounded-lg". Null when none set */
  shorthandValue: string | null;
  /** All slots */
  slots: CornerSlotData[];
  /** Scale values for the shorthand scrubber */
  shorthandScaleValues?: string[];
}

/** Props for the CornerModel component */
export interface CornerModelProps {
  state: CornerModelState;
  frozen?: boolean;
  onSlotClick?: (slotKey: SlotKey, anchorEl?: Element) => void;
  onSlotChange?: (slotKey: SlotKey, value: string) => void;
  onSlotHover?: (slotKey: SlotKey, value: string | null) => void;
  onSlotRemove?: (slotKey: SlotKey) => void;
  onSlotRemoveHover?: (slotKey: SlotKey) => void;
  onEditStart?: () => void;
}
