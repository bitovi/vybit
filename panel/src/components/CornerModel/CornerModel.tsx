import { useState } from 'react';
import './CornerModel.css';
import type { CornerModelProps, SlotKey, CornerSlotData } from './types';
import { MiniScrubber } from '../BoxModel/components/MiniScrubber';

/**
 * Grid layout — 3×3, each entry is [row, col] (1-indexed CSS grid).
 * center = ALL (shorthand)
 */
const SLOT_GRID: Record<SlotKey, [number, number]> = {
  tl:  [1, 1],
  t:   [1, 2],
  tr:  [1, 3],
  l:   [2, 1],
  all: [2, 2],
  r:   [2, 3],
  bl:  [3, 1],
  b:   [3, 2],
  br:  [3, 3],
};

/** Drag axis per slot — corners/sides scrub horizontally by default */
const SLOT_AXIS: Record<SlotKey, 'x' | 'y'> = {
  tl: 'x', t: 'x', tr: 'x',
  l: 'y',  all: 'x', r: 'y',
  bl: 'x', b: 'x', br: 'x',
};

/** Strip the "rounded" prefix and corner/side qualifier for compact display.
 *  e.g. "rounded-tl-lg" → "lg", "rounded-t-lg" → "lg", "rounded-lg" → "lg", "rounded" → "—" */
function truncateRounded(value: string): string {
  if (value === 'rounded') return '—';
  const withoutPrefix = value.replace(/^rounded-/, '');
  // Strip leading corner (tl/tr/br/bl) or side (t/r/b/l) qualifier
  return withoutPrefix.replace(/^(?:tl|tr|br|bl|[trbl])-/, '');
}

interface CornerCellProps {
  slot: CornerSlotData;
  frozen: boolean;
  isActive: boolean;
  onSlotClick: (slotKey: SlotKey, anchorEl: Element) => void;
  onSlotChange: (slotKey: SlotKey, value: string) => void;
  onSlotHover: (slotKey: SlotKey, value: string | null) => void;
  onSlotRemove?: (slotKey: SlotKey) => void;
  onSlotRemoveHover?: (slotKey: SlotKey) => void;
  onScrubStart: (slotKey: SlotKey) => void;
  onScrubEnd: () => void;
  onOpen: (slotKey: SlotKey) => void;
  onClose: () => void;
}

function CornerCell({
  slot, frozen, isActive,
  onSlotClick, onSlotChange, onSlotHover,
  onSlotRemove, onSlotRemoveHover,
  onScrubStart, onScrubEnd, onOpen, onClose,
}: CornerCellProps) {
  const [row, col] = SLOT_GRID[slot.key];
  const hasVal = slot.value != null;
  const slotCls = `cm-slot${hasVal ? ' cm-has-val' : ''}`;
  const cellCls = slot.key === 'all'
    ? 'cm-cell cm-cell-all cm-content'
    : `cm-cell cm-cell-${slot.key}`;
  const style = { gridRow: row, gridColumn: col };
  const axis = SLOT_AXIS[slot.key];

  if (slot.scaleValues && slot.scaleValues.length > 0) {
    return (
      <div className={cellCls} style={style}>
        <MiniScrubber
          placeholder={slot.placeholder}
          values={slot.scaleValues}
          currentValue={slot.value}
          displayValue={hasVal ? truncateRounded(slot.value!) : null}
          formatValue={truncateRounded}
          axis={axis}
          disabled={frozen}
          onHover={(v) => onSlotHover(slot.key, v)}
          onLeave={() => onSlotHover(slot.key, null)}
          onClick={(v) => onSlotChange(slot.key, v)}
          onScrubStart={() => onScrubStart(slot.key)}
          onScrubEnd={onScrubEnd}
          onOpen={() => onOpen(slot.key)}
          onClose={onClose}
          onRemove={onSlotRemove ? () => onSlotRemove!(slot.key) : undefined}
          onRemoveHover={onSlotRemoveHover ? () => onSlotRemoveHover!(slot.key) : undefined}
        />
      </div>
    );
  }

  return (
    <div className={cellCls} style={style}>
      <span
        className={slotCls}
        role="button"
        tabIndex={frozen ? -1 : 0}
        onClick={frozen ? undefined : (e) => onSlotClick(slot.key, e.currentTarget as Element)}
      >
        {hasVal ? truncateRounded(slot.value!) : slot.placeholder}
      </span>
    </div>
  );
}

export function CornerModel({
  state,
  frozen = false,
  onSlotClick,
  onSlotChange,
  onSlotHover,
  onSlotRemove,
  onSlotRemoveHover,
  onEditStart,
}: CornerModelProps) {
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);

  const effectiveFrozen = frozen || activeSlot !== null;

  const slotMap = new Map(state.slots.map(s => [s.key, s]));

  // Ensure an 'all' slot always exists for the shorthand
  const allSlot: CornerSlotData = slotMap.get('all') ?? {
    key: 'all',
    value: state.shorthandValue,
    placeholder: 'all',
    scaleValues: state.shorthandScaleValues,
  };

  const slots: SlotKey[] = ['tl', 't', 'tr', 'l', 'all', 'r', 'bl', 'b', 'br'];

  const rootCls = `cm-root${effectiveFrozen ? ' cm-frozen' : ''}${activeSlot ? ' cm-active' : ''}`;

  return (
    <div className={rootCls}>
      <div className="cm-grid">
        {slots.map(key => {
          const slot = key === 'all' ? allSlot : (slotMap.get(key) ?? {
            key,
            value: null,
            placeholder: key,
            scaleValues: undefined,
          });
          return (
            <CornerCell
              key={key}
              slot={slot}
              frozen={effectiveFrozen}
              isActive={activeSlot === key}
              onSlotClick={(k, el) => onSlotClick?.(k, el)}
              onSlotChange={(k, v) => onSlotChange?.(k, v)}
              onSlotHover={(k, v) => onSlotHover?.(k, v)}
              onSlotRemove={onSlotRemove}
              onSlotRemoveHover={onSlotRemoveHover}
              onScrubStart={(k) => { setActiveSlot(k); onEditStart?.(); }}
              onScrubEnd={() => setActiveSlot(null)}
              onOpen={(k) => { setActiveSlot(k); onEditStart?.(); }}
              onClose={() => setActiveSlot(null)}
            />
          );
        })}
      </div>
    </div>
  );
}
