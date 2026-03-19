export type FlexDirectionCss =
  | 'row'
  | 'column'
  | 'row-reverse'
  | 'column-reverse';

export interface FlexJustifyProps {
  /** Currently applied Tailwind class, e.g. 'justify-start', or null if not set */
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
