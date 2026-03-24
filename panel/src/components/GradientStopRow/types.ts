import type { GradientStop } from '../GradientBar';

export interface GradientStopRowProps {
  stop: GradientStop;
  onSwatchClick: (stopId: string, el: Element) => void;
  onRemove: (stopId: string) => void;
  onRemoveHover: (stopId: string) => void;
  onRemoveLeave: () => void;
  isSelected: boolean;
}
