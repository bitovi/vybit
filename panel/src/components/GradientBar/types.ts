export interface GradientStop {
  id: string;
  /** 'from' | 'via' | 'to' */
  role: 'from' | 'via' | 'to';
  /** Tailwind color name, e.g. 'blue-500' */
  colorName: string;
  /** Resolved hex for rendering, e.g. '#3B82F6' */
  hex: string;
  /** 0–100, null if no explicit position class exists */
  position: number | null;
}

export interface GradientBarProps {
  stops: GradientStop[];
  /** CSS direction string for the gradient, e.g. 'to right' */
  direction: string;
  /** Called while user drags a handle to a new position */
  onStopDrag: (stopId: string, newPosition: number) => void;
  /** Called when drag ends (mouse up) */
  onStopDragEnd: (stopId: string, position: number) => void;
  /** Called when user clicks a handle (to open color picker) */
  onStopClick: (stopId: string, anchorEl: Element) => void;
  /** Called when user clicks the bar to insert a new via stop */
  onBarClick: (position: number) => void;
  /** Called when user clicks × to remove a via stop */
  onStopRemove: (stopId: string) => void;
  /** ID of the currently selected stop (gets teal stroke) */
  selectedStopId: string | null;
}
