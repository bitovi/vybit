import { useState } from 'react';
import type { PropertySectionProps } from './types';
import { FocusTrapContainer } from '../FocusTrapContainer';

export function PropertySection({
  label,
  availableProperties = [],
  onAddProperty,
  isEmpty = false,
  children,
}: PropertySectionProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function handleSelect(prefix: string) {
    onAddProperty?.(prefix);
    setDropdownOpen(false);
  }

  return (
    <div className="mb-1">
      {/* Section header */}
      <div className="mt-3 mb-1 flex items-center gap-1.5">
        <span className="w-[5px] h-[5px] rounded-full bg-bv-teal opacity-50 shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-[1px] text-bv-text-mid">
          {label}
        </span>
        {availableProperties.length > 0 && (
          <div className="relative ml-auto">
            <button
              type="button"
              aria-label={`Add ${label} property`}
              className={`w-[18px] h-[18px] flex items-center justify-center rounded text-[11px] leading-none border transition-colors cursor-pointer ${
                dropdownOpen
                  ? 'border-bv-teal text-bv-teal bg-bv-teal/10'
                  : 'border-bv-border text-bv-muted bg-transparent hover:border-bv-teal hover:text-bv-teal hover:bg-bv-teal/10'
              }`}
              onClick={() => setDropdownOpen((o) => !o)}
            >
              +
            </button>
            {dropdownOpen && (
              <FocusTrapContainer
                className="absolute z-50 top-[calc(100%+2px)] right-0 bg-bv-bg border border-bv-border rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.10)] min-w-[180px] max-w-[calc(100vw-16px)] py-1"
                onClose={() => setDropdownOpen(false)}
              >
                {availableProperties.map((prop) => (
                  <button
                    type="button"
                    key={prop.prefix}
                    className="w-full px-2.5 py-[5px] text-[11px] font-[family-name:var(--font-ui)] text-bv-text-mid flex items-center gap-1.5 transition-colors hover:bg-bv-teal/10 hover:text-bv-teal cursor-pointer border-none bg-transparent text-left whitespace-nowrap"
                    onClick={() => handleSelect(prop.prefix)}
                  >
                    {prop.name}
                    <span className="font-mono text-[10px] text-bv-muted group-hover:text-bv-teal/60">
                      {prop.prefixHint}
                    </span>
                  </button>
                ))}
              </FocusTrapContainer>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      {isEmpty ? (
        <div className="text-[10px] text-bv-muted italic mb-2">
          No {label.toLowerCase()} classes — click + to add
        </div>
      ) : (
        <div className="flex flex-wrap gap-1 mb-2">{children}</div>
      )}

      {/* Divider */}
      <hr className="border-none border-t border-bv-border my-1" />
    </div>
  );
}
