import type { GradientDirection } from '../DirectionPicker';

export interface DirectionDropdownProps {
  direction: GradientDirection;
  onHover: (dir: GradientDirection) => void;
  onLeave: () => void;
  onClick: (dir: GradientDirection) => void;
}
