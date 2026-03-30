import type { ModeToggleProps } from './types';

const base = 'w-[30px] h-7 rounded-[4px] border-none flex items-center justify-center cursor-pointer transition-all duration-[120ms] ease-out';
const activeStyle = 'bg-[#00464A] text-[#5fd4da] shadow-[0_1px_3px_rgba(0,0,0,0.3)]';
const inactiveStyle = 'bg-transparent text-[#999] hover:text-[#b3b3b3]';

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-[6px] bg-[#1a1a1a] p-[2px] gap-[1px]">
      <button
        type="button"
        onClick={() => onModeChange('select')}
        className={`${base} ${mode === 'select' ? activeStyle : inactiveStyle}`}
        aria-pressed={mode === 'select'}
        title="Select an element"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14,0H2C.895,0,0,.895,0,2V14c0,1.105,.895,2,2,2H6c.552,0,1-.448,1-1h0c0-.552-.448-1-1-1H2V2H14V6c0,.552,.448,1,1,1h0c.552,0,1-.448,1-1V2c0-1.105-.895-2-2-2Z"/>
          <path d="M12.043,10.629l2.578-.644c.268-.068,.43-.339,.362-.607-.043-.172-.175-.308-.345-.358l-7-2c-.175-.051-.363-.002-.492,.126-.128,.129-.177,.317-.126,.492l2,7c.061,.214,.257,.362,.48,.362h.009c.226-.004,.421-.16,.476-.379l.644-2.578,3.664,3.664c.397,.384,1.03,.373,1.414-.025,.374-.388,.374-1.002,0-1.389l-3.664-3.664Z"/>
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('insert')}
        className={`${base} ${mode === 'insert' ? activeStyle : inactiveStyle}`}
        aria-pressed={mode === 'insert'}
        title="Insert to add content"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
          <rect x="4" y="2" width="16" height="8" rx="2"/>
          <path d="m17,14h1c1.105,0,2,.895,2,2"/>
          <path d="m4,16c0-1.105.895-2,2-2h1"/>
          <path d="m7,22h-1c-1.105,0-2-.895-2-2"/>
          <path d="m20,20c0,1.105-.895,2-2,2h-1"/>
          <line x1="13" y1="14" x2="11" y2="14"/>
          <line x1="13" y1="22" x2="11" y2="22"/>
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('bug-report')}
        className={`${base} ${mode === 'bug-report' ? activeStyle : inactiveStyle}`}
        aria-pressed={mode === 'bug-report'}
        title="Report a bug"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.5,6C11.5,4.067,9.933,2.5,8,2.5S4.5,4.067,4.5,6v1h7V6Z"/>
          <rect x="3" y="8" width="10" height="6" rx="2"/>
          <path d="M1,5.5h2.2C3.07,5.01,3,4.51,3,4h0V3.5H1c-.552,0-1,.448-1,1S.448,5.5,1,5.5Z"/>
          <path d="M15,3.5h-2c0,.51-.07,1.01-.2,1.5H15c.552,0,1-.448,1-1s-.448-1-1-1Z"/>
          <path d="M1,11.5h2.05c.232,.89,.62,1.71,1.13,2.5H1c-.552,0-1-.448-1-1s.448-1,1-1h0Z"/>
          <path d="M15,10.5h-2.05c-.232,.89-.62,1.71-1.13,2.5h3.18c.552,0,1-.448,1-1s-.448-1-1-1Z"/>
          <path d="M1,7.5h2v2H1c-.552,0-1-.448-1-1s.448-1,1-1Z"/>
          <path d="M13,7.5h2c.552,0,1,.448,1,1s-.448,1-1,1h-2v-2Z"/>
          <rect x="7" y="9" width="2" height="4" rx=".5"/>
        </svg>
      </button>
    </div>
  );
}
