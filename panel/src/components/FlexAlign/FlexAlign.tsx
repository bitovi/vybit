import { FlexDiagramPicker } from '../FlexDiagramPicker';
import { ALIGN_OPTIONS } from '../FlexDiagramPicker/diagrams';
import { AlignDiagrams } from '../FlexDiagramPicker/AlignDiagrams';
import type { FlexAlignProps } from './types';

// Align arrow points along the CROSS axis
const AXIS_ARROWS: Record<string, string> = {
  row:              '↓',
  column:           '→',
  'row-reverse':    '↓',
  'column-reverse': '→',
};

export function FlexAlign({
  currentValue,
  lockedValue,
  locked,
  flexDirection = 'row',
  onHover,
  onLeave,
  onClick,
  onRemove,
  onRemoveHover,
}: FlexAlignProps) {
  return (
    <FlexDiagramPicker
      options={ALIGN_OPTIONS}
      currentValue={currentValue}
      lockedValue={lockedValue}
      locked={locked}
      axisArrow={AXIS_ARROWS[flexDirection] ?? '↓'}
      placeholder="align-items"
      diagramFlexDirection={flexDirection}
      columns={5}
      onHover={onHover}
      onLeave={onLeave}
      onClick={onClick}
      onRemove={onRemove}
      onRemoveHover={onRemoveHover}
      renderGrid={({ activeValue, onSelect, onHoverValue }) => (
        <AlignDiagrams
          flexDirection={flexDirection}
          activeValue={activeValue}
          onSelect={onSelect}
          onHover={onHoverValue}
        />
      )}
    />
  );
}
