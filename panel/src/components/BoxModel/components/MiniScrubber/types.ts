export interface MiniScrubberProps {
  /** Text when no value (e.g., "t") */
  placeholder: string;
  /** All valid scale values in ascending order */
  values: string[];
  /** Currently applied value (full Tailwind class), or null */
  currentValue: string | null;
  /** Display text for the current value (truncated), or null */
  displayValue: string | null;
  /** Formats a full value for display (e.g., truncates layer prefix) */
  formatValue?: (value: string) => string;
  /** Drag direction: 'x' horizontal, 'y' vertical */
  axis?: 'x' | 'y';
  /** Disabled (frozen by another scrubber) */
  disabled?: boolean;
  /** Called during scrub or dropdown hover with the candidate value */
  onHover?: (value: string) => void;
  /** Called when hover/scrub preview ends */
  onLeave?: () => void;
  /** Called when user commits a value (click selection or scrub release) */
  onClick?: (value: string) => void;
  /** Called when scrubbing starts (drag threshold exceeded) */
  onScrubStart?: () => void;
  /** Called when scrubbing ends (pointer up after drag) */
  onScrubEnd?: () => void;
  /** Called when the dropdown opens */
  onOpen?: () => void;
  /** Called when the dropdown closes */
  onClose?: () => void;
  /** When provided, renders a red-✕ row at the top of the dropdown */
  onRemove?: () => void;
  /** Called when the mouse enters the remove row — use to preview removal */
  onRemoveHover?: () => void;
}
