import type { BoxModelSlotProps } from '../../types';
import type { LayerName } from '../../types';
import { MiniScrubber } from '../MiniScrubber';

/** Strip the layer prefix from a full Tailwind class for compact display.
 *  e.g. "pt-10" (padding) → "t-10", "border-t-2" → "t-2", "mx-4" → "x-4" */
function truncateValue(value: string, layer: LayerName): string {
  const prefixMap: Record<LayerName, string> = {
    padding: 'p',
    margin: 'm',
    border: 'border-',
    outline: 'outline-',
  };
  const prefix = prefixMap[layer];
  if (value.startsWith(prefix)) {
    return value.slice(prefix.length);
  }
  return value;
}

export function BoxModelSlot({
  value,
  placeholder,
  layer,
  frozen,
  scaleValues,
  axis,
  onClick,
  onValueChange,
  onValueHover,
  onValueLeave,
  onScrubStart,
  onScrubEnd,
  onOpen,
  onClose,
}: BoxModelSlotProps) {
  const hasVal = value != null;
  const displayText = hasVal ? truncateValue(value, layer) : null;

  // When scale values are provided, render an interactive MiniScrubber
  if (scaleValues && scaleValues.length > 0) {
    return (
      <MiniScrubber
        placeholder={placeholder}
        values={scaleValues}
        currentValue={value}
        displayValue={displayText}
        formatValue={(v) => truncateValue(v, layer)}
        axis={axis}
        disabled={frozen}
        onHover={onValueHover}
        onLeave={onValueLeave}
        onClick={onValueChange}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onOpen={onOpen}
        onClose={onClose}
      />
    );
  }

  // Fallback: plain span (for non-interactive stories)
  const className = `bm-slot${hasVal ? ' bm-has-val' : ''}`;

  return (
    <span
      className={className}
      onClick={frozen ? undefined : (e) => onClick?.(e.currentTarget as Element)}
      role="button"
      tabIndex={frozen ? -1 : 0}
    >
      {displayText ?? placeholder}
    </span>
  );
}
