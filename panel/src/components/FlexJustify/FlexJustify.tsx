import { FlexDiagramPicker } from '../FlexDiagramPicker';
import { JUSTIFY_OPTIONS } from '../FlexDiagramPicker/diagrams';
import { JustifyDiagrams } from '../FlexDiagramPicker/JustifyDiagrams';
import type { FlexJustifyProps } from './types';

// Arrow on the pill shows which physical axis justify-content controls
const AXIS_ARROWS: Record<string, string> = {
  row:              '→',
  column:           '↓',
  'row-reverse':    '←',
  'column-reverse': '↑',
};

export function FlexJustify({
  currentValue,
  lockedValue,
  locked,
  flexDirection = 'row',
  onHover,
  onLeave,
  onClick,
  onRemove,
  onRemoveHover,
}: FlexJustifyProps) {
  return (
    <FlexDiagramPicker
      options={JUSTIFY_OPTIONS}
      currentValue={currentValue}
      lockedValue={lockedValue}
      locked={locked}
      axisArrow={AXIS_ARROWS[flexDirection] ?? '→'}
      placeholder="justify-content"
      diagramFlexDirection={flexDirection}
      columns={4}
      onHover={onHover}
      onLeave={onLeave}
      onClick={onClick}
      onRemove={onRemove}
      onRemoveHover={onRemoveHover}
      renderGrid={({ activeValue, onSelect, onHoverValue }) => (
        <JustifyDiagrams
          flexDirection={flexDirection}
          activeValue={activeValue}
          onSelect={onSelect}
          onHover={onHoverValue}
        />
      )}
    />
  );
}
