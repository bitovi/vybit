import React from 'react';

// Maps named spacing keys to their pixel equivalent for sorting purposes.
// 'px' = 1px = 1/16 rem ≈ 0.0625. Others like 'auto'/'full' go to the end.
const SPECIAL_SPACING_ORDER: Record<string, number> = {
  px: 0.0625,
};

function spacingKeyOrder(k: string): number {
  if (!isNaN(Number(k))) return Number(k);
  return SPECIAL_SPACING_ORDER[k] ?? Infinity;
}

function getScaleValues(prefix: string, themeKey: string | null, config: any): string[] {
  if (themeKey === 'spacing' && config?.spacing) {
    const keys = Object.keys(config.spacing);
    return keys
      .sort((a, b) => spacingKeyOrder(a) - spacingKeyOrder(b))
      .map((k) => `${prefix}${k}`);
  }
  if (themeKey === 'fontSize') {
    return ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl'];
  }
  if (themeKey === 'fontWeight') {
    return ['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'];
  }
  if (themeKey === 'borderRadius') {
    return ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full'];
  }
  return [];
}

interface ScaleRowProps {
  prefix: string;
  themeKey: string | null;
  currentClass: string;
  tailwindConfig: any;
  locked: boolean;
  lockedValue: string | null;
  onHover: (fullClass: string) => void;
  onLeave: () => void;
  onClick: (fullClass: string) => void;
}

export function ScaleRow({ prefix, themeKey, currentClass, tailwindConfig, locked, lockedValue, onHover, onLeave, onClick }: ScaleRowProps) {
  const scaleValues = getScaleValues(prefix, themeKey, tailwindConfig);
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

