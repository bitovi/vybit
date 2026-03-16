import { useState } from 'react';
import type { TabBarProps } from './types';

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const [hoveredDisabled, setHoveredDisabled] = useState<string | null>(null);

  return (
    <div className="relative flex border-b border-bv-border px-3">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled === true;

        return (
          <div
            key={tab.id}
            className="relative"
            onMouseEnter={() => isDisabled && tab.tooltip && setHoveredDisabled(tab.id)}
            onMouseLeave={() => setHoveredDisabled(null)}
          >
            <button
              type="button"
              className={`relative px-3 py-2 text-[12px] font-medium font-[family-name:var(--font-ui)] border-none bg-transparent cursor-pointer transition-colors ${
                isDisabled
                  ? 'text-bv-muted cursor-not-allowed'
                  : isActive
                    ? 'text-bv-text'
                    : 'text-bv-text-mid hover:text-bv-text'
              }`}
              disabled={isDisabled}
              onClick={() => !isDisabled && onTabChange(tab.id)}
              aria-selected={isActive}
              role="tab"
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-bv-teal" />
              )}
            </button>
            {hoveredDisabled === tab.id && tab.tooltip && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-[10px] text-white bg-bv-text rounded whitespace-nowrap z-[9999]">
                {tab.tooltip}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
