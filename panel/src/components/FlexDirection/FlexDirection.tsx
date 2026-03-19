import type { FlexDirectionProps, FlexDirectionValue } from './types';

const OPTIONS: Array<{ value: FlexDirectionValue; arrow: string; title: string }> = [
  { value: 'flex-row',         arrow: '→', title: 'flex-row' },
  { value: 'flex-col',         arrow: '↓', title: 'flex-col' },
  { value: 'flex-row-reverse', arrow: '←', title: 'flex-row-reverse' },
  { value: 'flex-col-reverse', arrow: '↑', title: 'flex-col-reverse' },
];

export function FlexDirection({
  value,
  lockedValue,
  locked,
  onHover,
  onLeave,
  onClick,
}: FlexDirectionProps) {
  const isThisLocked = lockedValue !== null && OPTIONS.some((o) => o.value === lockedValue);
  const foreignLocked = locked && !isThisLocked;
  const displayValue = (isThisLocked ? lockedValue : value) as FlexDirectionValue | null;

  return (
    <div
      className="inline-flex rounded border border-bv-border overflow-hidden"
      onMouseLeave={onLeave}
    >
      {OPTIONS.map((opt) => {
        const isActive = opt.value === displayValue;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            disabled={foreignLocked}
            className={`w-7 h-[22px] flex items-center justify-center text-xs transition-all duration-150 border-r border-bv-border last:border-r-0
              ${isActive
                ? 'bg-bv-teal text-white'
                : foreignLocked
                ? 'bg-bv-bg text-bv-muted cursor-default'
                : 'bg-bv-bg text-bv-text-mid hover:bg-bv-teal/9 hover:text-bv-teal cursor-pointer'
              }`}
            onMouseEnter={() => !foreignLocked && onHover(opt.value)}
            onClick={() => !foreignLocked && onClick(opt.value)}
          >
            {opt.arrow}
          </button>
        );
      })}
    </div>
  );
}
