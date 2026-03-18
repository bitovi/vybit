export type DrawingTool = 'freehand' | 'rectangle' | 'circle' | 'line' | 'arrow' | 'text' | 'eraser' | 'select';

export const BASIC_COLORS = [
  '#000000', // black
  '#ffffff', // white
  '#9CA3AF', // gray
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6366F1', // indigo
] as const;

export interface DesignCanvasProps {
  onSubmit: (imageDataUrl: string, width: number, height: number) => void;
  onClose?: () => void;
  backgroundImage?: string;  // base64 PNG data URL — locked background for screenshot annotation
}
