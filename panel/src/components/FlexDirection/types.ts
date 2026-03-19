export type FlexDirectionValue =
  | 'flex-row'
  | 'flex-col'
  | 'flex-row-reverse'
  | 'flex-col-reverse';

export interface FlexDirectionProps {
  /** Currently applied class, or null if not set on the element */
  value: FlexDirectionValue | null;
  lockedValue: string | null;
  locked: boolean;
  onHover: (value: FlexDirectionValue) => void;
  onLeave: () => void;
  onClick: (value: FlexDirectionValue) => void;
}
