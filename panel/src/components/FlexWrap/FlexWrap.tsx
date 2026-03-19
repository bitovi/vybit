import type { FlexWrapProps, FlexWrapValue } from './types';

const OPTIONS: Array<{ value: FlexWrapValue; label: string; title: string }> = [
  { value: 'flex-nowrap',       label: '⊣',  title: 'flex-nowrap'       },
  { value: 'flex-wrap',         label: '↩', title: 'flex-wrap'         },
  { value: 'flex-wrap-reverse', label: '↪', title: 'flex-wrap-reverse' },
];

export function FlexWrap({
  value,
  lockedValue,
  locked,
  onHover,
  onLeave,
  onClick,
}: FlexWrapProps) {
  const isThisLocked = lockedValue !== null && OPTIONS.some((o) => o.value === lockedValue);
  const foreignLocked = locked && !isThisLocked;
  const displayValue = (isThisLocked ? lockedValue : value) as FlexWrapValue;

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
            className={`px-2 h-[22px] flex items-center justify-center text-[11px] font-mono transition-all duration-150 border-r border-bv-border last:border-r-0
              ${isActive
                ? 'bg-bv-teal text-white'
                : foreignLocked
                ? 'bg-bv-bg text-bv-muted cursor-default'
                : 'bg-bv-bg text-bv-text-mid hover:bg-bv-teal/9 hover:text-bv-teal cursor-pointer'
              }`}
            onMouseEnter={() => !foreignLocked && onHover(opt.value)}
            onClick={() => !foreignLocked && onClick(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
