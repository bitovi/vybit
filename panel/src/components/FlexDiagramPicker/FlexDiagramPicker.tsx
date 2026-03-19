import { useState } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import { FocusTrapContainer } from '../FocusTrapContainer';
import type { FlexDiagramPickerProps } from './types';

export function FlexDiagramPicker({
  options,
  currentValue,
  lockedValue,
  locked,
  axisArrow,
  placeholder,
  onHover,
  onLeave,
  onClick,
  onRemove,
  onRemoveHover,
  columns = 4,
  diagramFlexDirection = 'row',
  renderGrid,
}: FlexDiagramPickerProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => { if (!next) { setOpen(false); onLeave(); } },
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const isThisLocked = lockedValue !== null && options.some((o) => o.value === lockedValue);
  const foreignLocked = locked && !isThisLocked;
  const isUnset = !isThisLocked && (currentValue === null || currentValue === '');
  const displayValue = isThisLocked ? lockedValue! : (currentValue ?? '');

  const activeOption = options.find((o) => o.value === displayValue);
  // Show the last segment of the class name, e.g. 'justify-start' → 'start'
  const labelText = activeOption?.label ?? (isUnset ? (placeholder ?? '—') : displayValue);

  function close() {
    setOpen(false);
    onLeave();
  }

  function handlePillClick() {
    if (foreignLocked) return;
    setOpen((prev) => {
      if (prev) onLeave();
      return !prev;
    });
  }

  const pillBase = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border cursor-pointer select-none transition-all duration-150';
  const pillStyle = open
    ? 'border-bv-teal bg-bv-teal/9 text-bv-teal'
    : isThisLocked
    ? 'border-bv-border bg-bv-surface-hi text-bv-text hover:border-bv-teal hover:bg-bv-teal/9 hover:text-bv-teal'
    : foreignLocked
    ? 'border-transparent bg-bv-surface text-bv-text-mid cursor-default'
    : isUnset
    ? 'border-dashed border-bv-border bg-bv-bg text-bv-muted hover:border-bv-teal hover:bg-bv-teal/9 hover:text-bv-teal'
    : 'border-bv-border bg-bv-bg text-bv-text-mid hover:border-bv-teal hover:bg-bv-teal/9 hover:text-bv-teal';

  return (
    <div className="relative inline-block">
      {/* Pill trigger */}
      <div
        ref={refs.setReference}
        className={`${pillBase} ${pillStyle}`}
        role="button"
        tabIndex={foreignLocked ? -1 : 0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePillClick(); }}
        onClick={handlePillClick}
        {...getReferenceProps()}
      >
        <span className={`text-[10px] transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-50'}`}>
          {axisArrow}
        </span>
        <span>{labelText}</span>
        <span className={`text-[8px] ml-0.5 transition-all duration-150 ${open ? 'opacity-70 rotate-180' : 'opacity-35'}`}>
          ▾
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <FloatingPortal>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-[9999]"
          {...getFloatingProps()}
        >
        <FocusTrapContainer
          className="bg-bv-bg border border-bv-border rounded-lg shadow-lg p-2 flex flex-col gap-1"
          onMouseLeave={onLeave}
          onClose={close}
        >
          {/* Remove row */}
          {onRemove && (
            <div
              className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] font-mono text-bv-muted border-b border-bv-border mb-1 pb-1.5 cursor-pointer transition-colors duration-150 hover:text-bv-orange"
              onMouseEnter={onRemoveHover}
              onMouseLeave={onLeave}
              onClick={() => { onRemove(); close(); }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              remove
            </div>
          )}

          {/* Diagram grid */}
          {renderGrid
            ? renderGrid({
                activeValue: displayValue,
                onSelect: (value) => { onClick(value); close(); },
                onHoverValue: onHover,
              })
            : (
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, 60px)` }}
            >
              {options.map((opt) => {
                const isActive = opt.value === displayValue;
                return (
                  <div
                    key={opt.value}
                    className="flex flex-col items-center gap-0.5 cursor-pointer"
                    onMouseEnter={() => onHover(opt.value)}
                    onClick={() => { onClick(opt.value); close(); }}
                  >
                    {/* 60×60 diagram box — IS the flex container, matching the prototype */}
                    <div
                      className={`group w-[60px] h-[60px] rounded-[5px] border-[1.5px] p-1 flex overflow-hidden transition-all duration-150
                        ${isActive
                          ? 'border-bv-teal bg-bv-teal/9 shadow-[0_0_0_2px_rgba(0,132,139,0.18)]'
                          : 'border-bv-border bg-bv-surface hover:border-bv-teal hover:bg-bv-teal/9'
                        }`}
                      style={opt.getContainerStyle(diagramFlexDirection)}
                    >
                      {opt.renderItems(diagramFlexDirection)}
                    </div>
                    <span className={`text-[9px] font-mono text-center transition-colors duration-150
                      ${isActive ? 'text-bv-teal font-semibold' : 'text-bv-text-mid'}`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </FocusTrapContainer>
        </div>
        </FloatingPortal>
      )}
    </div>
  );
}
