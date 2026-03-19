export type FlexWrapValue =
  | 'flex-nowrap'
  | 'flex-wrap'
  | 'flex-wrap-reverse';

export interface FlexWrapProps {
  /** Currently applied class, or null if not set on the element */
  value: FlexWrapValue | null;
  lockedValue: string | null;
  locked: boolean;
  onHover: (value: FlexWrapValue) => void;
  onLeave: () => void;
  onClick: (value: FlexWrapValue) => void;
}
