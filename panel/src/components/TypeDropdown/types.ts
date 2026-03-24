import type { FillType } from '../GradientEditor/types';

export interface TypeDropdownProps {
  fillType: FillType;
  onChange: (type: FillType) => void;
}
