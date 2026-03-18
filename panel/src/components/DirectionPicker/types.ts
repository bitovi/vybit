export type GradientDirection = 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l' | 'tl';
export type BackgroundMode = 'gradient' | 'solid';

export interface DirectionPickerProps {
  /** Current gradient direction short name, e.g. 'r' */
  direction: GradientDirection;
  /** 'gradient' (direction arrows active) or 'solid' (center ● active) */
  mode: BackgroundMode;
  /** Fired on hover for live preview. Null when hovering center cell. */
  onHover: (dir: GradientDirection) => void;
  /** Fired when mouse leaves the grid */
  onLeave: () => void;
  /** Fired on direction click — switches to gradient mode */
  onDirectionClick: (dir: GradientDirection) => void;
  /** Fired when center ● is clicked — switches to solid mode */
  onSolidClick: () => void;
  /** The current solid color name (e.g. 'blue-500'), shown in the label when in solid mode */
  solidColorName?: string | null;
}
