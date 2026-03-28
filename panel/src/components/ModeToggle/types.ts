import type { AppMode } from '../../../../shared/types';

export interface ModeToggleProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}
