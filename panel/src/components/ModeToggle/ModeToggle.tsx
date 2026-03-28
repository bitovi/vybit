import type { ModeToggleProps } from './types';

const base = 'h-7 px-2 rounded-[5px] border-none text-[10px] font-semibold tracking-[0.2px] cursor-pointer transition-all duration-[120ms] ease-out';
const activeStyle = 'shadow-[inset_0_0_0_1.5px_#00848B] text-[#5fd4da] opacity-100 hover:bg-[#333] hover:text-white';
const inactiveStyle = 'bg-transparent text-[#aaa] opacity-40 hover:bg-[#333] hover:text-white hover:opacity-100';

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-[1px]">
      <button
        type="button"
        onClick={() => onModeChange('select')}
        className={`${base} ${mode === 'select' ? activeStyle : inactiveStyle}`}
        aria-pressed={mode === 'select'}
      >
        Select
      </button>
      <button
        type="button"
        onClick={() => onModeChange('insert')}
        className={`${base} ${mode === 'insert' ? activeStyle : inactiveStyle}`}
        aria-pressed={mode === 'insert'}
      >
        Insert
      </button>
    </div>
  );
}
