export interface FlexDiagramOption {
  /** The Tailwind class this option applies, e.g. 'justify-start' */
  value: string;
  /** Short label shown below the diagram, e.g. 'start' */
  label: string;
  /**
   * Returns CSS properties to apply to the 60×60 flex container.
   * The container already has display:flex — this adds flex-direction,
   * justify-content, align-items, gap, etc.
   * Receives the current flex-direction string (e.g. 'row', 'column-reverse').
   */
  getContainerStyle: (flexDirection: string) => React.CSSProperties;
  /**
   * Returns the flex children (items, gap-zones) to render directly inside
   * the 60×60 flex container — no wrapper div needed.
   */
  renderItems: (flexDirection: string) => React.ReactNode;
}

export interface FlexDiagramPickerProps {
  /** All selectable options */
  options: FlexDiagramOption[];
  /** Currently applied Tailwind class, or null if the property is not set */
  currentValue: string | null;
  /** Staged (locked) value, or null */
  lockedValue: string | null;
  /** True when any property is globally locked */
  locked: boolean;
  /** Short symbol showing which axis this property controls e.g. '→' or '↓' */
  axisArrow: string;
  /** Label shown in the pill when currentValue is null/unset, e.g. 'justify' or 'align' */
  placeholder?: string;
  onHover: (value: string) => void;
  onLeave: () => void;
  onClick: (value: string) => void;
  onRemove?: () => void;
  onRemoveHover?: () => void;
  /** Number of columns in the diagram grid */
  columns?: number;
  /**
   * Optional render prop that replaces the built-in options.map() grid.
   * Receives the resolved active value, an onSelect callback (select + close),
   * and an onHoverValue callback (preview). When provided, `options` is still
   * used for label lookup but not for rendering cells.
   */
  renderGrid?: (params: {
    activeValue: string;
    onSelect: (value: string) => void;
    onHoverValue: (value: string) => void;
  }) => React.ReactNode;
  /**
   * CSS flex-direction string driven by the parent flex-direction selection.
   * e.g. 'row', 'column', 'row-reverse', 'column-reverse'
   */
  diagramFlexDirection?: string;
}
