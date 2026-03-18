import type { DirectionPickerProps, GradientDirection } from './types';

const GRID: Array<{ dir: GradientDirection; arrow: string } | 'center'> = [
  { dir: 'tl', arrow: '↖' },
  { dir: 't',  arrow: '↑' },
  { dir: 'tr', arrow: '↗' },
  { dir: 'l',  arrow: '←' },
  'center',
  { dir: 'r',  arrow: '→' },
  { dir: 'bl', arrow: '↙' },
  { dir: 'b',  arrow: '↓' },
  { dir: 'br', arrow: '↘' },
];

export function DirectionPicker({
  direction,
  mode,
  onHover,
  onLeave,
  onDirectionClick,
  onSolidClick,
  solidColorName,
}: DirectionPickerProps) {
  const isSolid = mode === 'solid';

  return (
    <div className="flex flex-col items-center shrink-0">
      <div
        className="grid grid-cols-3 gap-0.5"
        onMouseLeave={onLeave}
      >
        {GRID.map((cell, i) => {
          if (cell === 'center') {
            const active = isSolid;
            return (
              <button
                key="center"
                type="button"
                className={`w-5 h-5 rounded-[3px] flex items-center justify-center text-xs cursor-pointer transition-all duration-150
                  ${active
                    ? 'border-[1.5px] border-bv-orange bg-bv-orange text-white'
                    : 'border-[1.5px] border-bv-border bg-bv-bg text-bv-muted hover:border-bv-orange hover:bg-bv-orange/9 hover:text-bv-orange'
                  }`}
                title="Solid color"
                onClick={onSolidClick}
              >
                ●
              </button>
            );
          }

          const isActive = !isSolid && direction === cell.dir;
          return (
            <button
              key={cell.dir}
              type="button"
              className={`w-5 h-5 rounded-[3px] flex items-center justify-center text-[10px] cursor-pointer transition-all duration-150
                ${isSolid ? 'opacity-35 hover:opacity-100' : ''}
                ${isActive
                  ? 'border-[1.5px] border-bv-teal bg-bv-teal text-white'
                  : 'border-[1.5px] border-bv-border bg-bv-bg text-bv-muted hover:border-bv-teal hover:bg-bv-teal/9 hover:text-bv-teal'
                }`}
              onMouseEnter={() => onHover(cell.dir)}
              onClick={() => onDirectionClick(cell.dir)}
            >
              {cell.arrow}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] font-mono text-bv-text-mid mt-0.75 max-w-[68px] truncate text-center">
        {isSolid ? (
          solidColorName
            ? <span className="text-bv-orange font-bold">{solidColorName}</span>
            : <span className="text-bv-muted italic">none</span>
        ) : (
          <span>to-<span className="text-bv-teal font-bold">{direction}</span></span>
        )}
      </div>
    </div>
  );
}
