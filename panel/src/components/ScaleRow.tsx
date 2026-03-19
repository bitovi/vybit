import React from 'react';
import { getScaleValues } from './getScaleValues';

interface ScaleRowProps {
  prefix: string;
  scaleName: string | null;
  currentClass: string;
  tailwindConfig: any;
  locked: boolean;
  lockedValue: string | null;
  onHover: (fullClass: string) => void;
  onLeave: () => void;
  onClick: (fullClass: string) => void;
}

export function ScaleRow({ prefix, scaleName, currentClass, tailwindConfig, locked, lockedValue, onHover, onLeave, onClick }: ScaleRowProps) {
  const scaleValues = getScaleValues(prefix, scaleName, tailwindConfig);
  if (scaleValues.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-[3px] my-2 p-2 bg-bv-surface border border-bv-border rounded-md"
      onMouseLeave={() => { if (!locked) onLeave(); }}
    >
      {scaleValues.map((val) => (
        <ScaleChip
          key={val}
          value={val}
          isCurrent={val === currentClass}
          isLocked={lockedValue === val}
          locked={locked}
          onMouseEnter={() => { if (!locked) onHover(val); }}
          onClick={() => onClick(val)}
        />
      ))}
    </div>
  );
}

interface ScaleChipProps {
  value: string;
  isCurrent: boolean;
  isLocked: boolean;
  locked: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}

function ScaleChip({ value, isCurrent, isLocked, locked, onMouseEnter, onClick }: ScaleChipProps) {
  const base = 'px-1.5 py-0.5 rounded bg-bv-surface-hi text-bv-text-mid cursor-pointer text-[10.5px] font-mono border border-transparent transition-colors';
  const hover = locked ? '' : 'hover:border-bv-teal hover:bg-bv-teal/9 hover:text-bv-teal';
  const current = isCurrent ? 'border-bv-teal bg-bv-teal/9 text-bv-teal' : '';
  const preview = isLocked ? 'border-bv-orange bg-bv-orange/9 text-bv-orange' : '';

  return (
    <div
      className={`${base} ${hover} ${current} ${preview}`}
      onMouseEnter={onMouseEnter}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {value}
    </div>
  );
}

