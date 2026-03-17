import { useState } from 'react';
import type { BoxModelRingProps, SlotKey } from '../../types';
import { BoxModelSlot } from '../BoxModelSlot';
import { MiniScrubber } from '../MiniScrubber';

/** Maps slot keys to their slot-group CSS class */
const SLOT_POSITIONS: Record<string, SlotKey[]> = {
  top: ['y', 't'],
  right: ['r'],
  bottom: ['b'],
  left: ['x', 'l'],
  tr: ['color'],
  bl: ['style'],
  br: ['offset'],
};

/** Which position groups exist per layer */
const LAYER_GROUPS: Record<string, string[]> = {
  margin: ['top', 'right', 'bottom', 'left'],
  outline: ['top', 'right', 'bottom', 'left', 'tr', 'bl', 'br'],
  border: ['top', 'right', 'bottom', 'left', 'tr', 'bl'],
  padding: ['top', 'right', 'bottom', 'left'],
};

/** Scrub axis per position group: top/bottom → vertical, sides/corners → horizontal */
const GROUP_AXIS: Record<string, 'x' | 'y'> = {
  top: 'y',
  bottom: 'y',
  left: 'x',
  right: 'x',
  tr: 'x',
  bl: 'x',
  br: 'x',
};

export function BoxModelRing({
  layer,
  classState,
  shorthandValue,
  shorthandScaleValues,
  slots,
  isHovered,
  frozen,
  onHoverChange,
  onSlotClick,
  onSlotChange,
  onSlotHover,
  onScrubStart,
  onScrubEnd,
  onSlotOpen,
  onSlotClose,
  children,
}: BoxModelRingProps & { shorthandScaleValues?: string[] }) {
  const layerClass = `bm-layer bm-${layer}${isHovered ? ' bm-hovered' : ''}`;

  // Track which group name has an open dropdown (for z-index elevation)
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Build a lookup: slotKey → SlotData
  const slotMap = new Map(slots.map(s => [s.key, s]));

  // Determine label content — always a MiniScrubber when shorthandScaleValues provided
  const showShorthandVal = (classState === 'shorthand' || classState === 'mixed') && shorthandValue;
  const label = shorthandScaleValues && shorthandScaleValues.length > 0 ? (
    <span className="bm-name bm-name-scrubber">
      <MiniScrubber
        placeholder={layer}
        values={shorthandScaleValues}
        currentValue={showShorthandVal ? shorthandValue : null}
        displayValue={showShorthandVal ? shorthandValue : null}
        formatValue={(v) => v}
        axis="x"
        disabled={frozen}
        onHover={(v) => onSlotHover?.('shorthand', v)}
        onLeave={() => onSlotHover?.('shorthand', null)}
        onClick={(v) => onSlotChange?.('shorthand', v)}
        onScrubStart={() => { onScrubStart?.(); }}
        onScrubEnd={onScrubEnd}
        onOpen={() => { setOpenGroup('__shorthand__'); onSlotOpen?.(); }}
        onClose={() => { setOpenGroup(null); onSlotClose?.(); }}
      />
    </span>
  ) : showShorthandVal ? (
    <span className="bm-name">
      <span className="bm-val" onClick={(e) => onSlotClick?.('shorthand', e.currentTarget as Element)}>
        {shorthandValue}
      </span>
    </span>
  ) : (
    <span className="bm-name">{layer}</span>
  );

  // Render slot groups for this layer
  const groups = LAYER_GROUPS[layer] ?? [];
  const slotGroups = groups.map(groupName => {
    const slotKeys = SLOT_POSITIONS[groupName] ?? [];
    // Filter to slots that exist for this layer
    const groupSlots = slotKeys
      .map(k => slotMap.get(k))
      .filter((s): s is NonNullable<typeof s> => s != null);

    if (groupSlots.length === 0) return null;

    const hasValues = groupSlots.some(s => s.value != null);
    const isActive = openGroup === groupName;
    const groupClass = `bm-slot-group bm-sg-${groupName}${hasValues ? ' bm-has-values' : ''}${isActive ? ' bm-sg-active' : ''}`;
    const axis = GROUP_AXIS[groupName];

    return (
      <div key={groupName} className={groupClass}>
        {groupSlots.map(slot => (
          <BoxModelSlot
            key={slot.key}
            slotKey={slot.key}
            value={slot.value}
            placeholder={slot.placeholder}
            layer={layer}
            isExpanded={isHovered}
            frozen={frozen}
            scaleValues={slot.scaleValues}
            axis={axis}
            onClick={(anchorEl) => onSlotClick?.(slot.key, anchorEl)}
            onValueChange={onSlotChange ? (v) => onSlotChange(slot.key, v) : undefined}
            onValueHover={onSlotHover ? (v) => onSlotHover(slot.key, v) : undefined}
            onValueLeave={onSlotHover ? () => onSlotHover(slot.key, null) : undefined}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            onOpen={() => { setOpenGroup(groupName); onSlotOpen?.(); }}
            onClose={() => { setOpenGroup(null); onSlotClose?.(); }}
          />
        ))}
      </div>
    );
  });

  const handleMouseOver = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!frozen) onHoverChange(true);
  };
  const handleMouseOut = (e: React.MouseEvent) => {
    // Only fire if we're leaving to an element outside this ring
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget as Node;
    if (related && current.contains(related)) return;
    if (!frozen) onHoverChange(false);
  };

  return (
    <div
      className={layerClass}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      data-layer={layer}
    >
      {label}
      {slotGroups}
      {children}
    </div>
  );
}
