import { useState, useRef, useEffect } from 'react';
import { sendTo } from '../ws';
import type { ContainerName } from '../../../overlay/src/messages';

const CONTAINERS: { name: ContainerName; label: string; icon: React.ReactNode }[] = [
  {
    name: 'popover',
    label: 'Popover',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.1" opacity="0.3"/>
        <rect x="4" y="4" width="8" height="6" rx="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    name: 'sidebar',
    label: 'Sidebar',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.1" opacity="0.3"/>
        <rect x="9" y="1" width="6" height="14" rx="1.5" fill="currentColor" opacity="0.85"/>
      </svg>
    ),
  },
  {
    name: 'modal',
    label: 'Modal',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="1.5" fill="currentColor" opacity="0.12"/>
        <rect x="3" y="4" width="10" height="8" rx="1" fill="currentColor" opacity="0.9"/>
      </svg>
    ),
  },
  {
    name: 'popup',
    label: 'Popup',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.1" opacity="0.3"/>
        <rect x="8" y="8" width="7" height="7" rx="1" fill="currentColor" opacity="0.85"/>
      </svg>
    ),
  },
];

const STORAGE_KEY = 'tw-panel-container';

function getActive(): ContainerName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CONTAINERS.some(c => c.name === stored)) return stored as ContainerName;
  } catch { /* ignore */ }
  return 'popover';
}

export function ContainerSwitcher() {
  const [active, setActive] = useState<ContainerName>(getActive);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSwitch(name: ContainerName) {
    if (name !== active) {
      try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignore */ }
      setActive(name);
      sendTo('overlay', { type: 'SWITCH_CONTAINER', container: name });
    }
    setOpen(false);
  }

  const activeContainer = CONTAINERS.find(c => c.name === active)!;

  return (
    <div ref={ref} className="relative">
      <button
        title="Change container"
        onClick={() => setOpen(o => !o)}
        className="w-7 h-7 flex items-center justify-center rounded border border-transparent text-bv-text-mid bg-transparent cursor-pointer transition-colors hover:bg-bv-surface hover:border-bv-border hover:text-bv-text"
      >
        {activeContainer.icon}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 bg-white border border-bv-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12)] p-1.5 flex flex-col gap-px min-w-[148px] z-50">
          <div className="text-[9px] font-semibold uppercase tracking-[0.8px] text-bv-muted px-2 pt-1 pb-1.5">Container</div>
          {CONTAINERS.map((c) => (
            <button
              key={c.name}
              onClick={() => handleSwitch(c.name)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-[12px] cursor-pointer border-none w-full text-left transition-colors ${
                c.name === active
                  ? 'bg-bv-teal/9 text-bv-teal'
                  : 'bg-transparent text-bv-text-mid hover:bg-bv-surface hover:text-bv-text'
              }`}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
          <div className="h-px bg-bv-border mx-1 my-1" />
          <button
            onClick={() => {
              setOpen(false);
              sendTo('overlay', { type: 'CLOSE_PANEL' });
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] cursor-pointer border-none w-full text-left transition-colors bg-transparent text-bv-text-mid hover:bg-bv-surface hover:text-bv-text"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Close panel
          </button>
        </div>
      )}
    </div>
  );
}

