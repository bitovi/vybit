export type FlexDirectionCss =
  | 'row'
  | 'column'
  | 'row-reverse'
  | 'column-reverse';

export interface FlexAlignProps {
  /** Currently applied Tailwind class, e.g. 'items-stretch', or null if not set */
  currentValue: string | null;
  lockedValue: string | null;
  locked: boolean;
  /** CSS flex-direction of the container being edited — used to orient diagrams */
  flexDirection?: FlexDirectionCss;
  onHover: (value: string) => void;
  onLeave: () => void;
  onClick: (value: string) => void;
  onRemove?: () => void;
  onRemoveHover?: () => void;
}
