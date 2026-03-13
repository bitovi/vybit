import { useState } from 'react';
import type { ParsedClass } from '../../overlay/src/class-parser';
import { ColorGrid } from './components/ColorGrid';
import { ScaleRow } from './components/ScaleRow';
import { ContainerSwitcher } from './components/ContainerSwitcher';
import { sendTo } from './ws';

const CATEGORY_LABELS: Record<string, string> = {
  spacing: 'Spacing',
  sizing: 'Sizing',
  typography: 'Typography',
  color: 'Color',
  borders: 'Borders',
  effects: 'Effects',
  layout: 'Layout',
  flexbox: 'Flexbox & Grid',
};

function groupByCategory(classes: ParsedClass[]): Map<string, ParsedClass[]> {
  const groups = new Map<string, ParsedClass[]>();
  for (const cls of classes) {
    const list = groups.get(cls.category) || [];
    list.push(cls);
    groups.set(cls.category, list);
  }
  return groups;
}

interface PickerProps {
  componentName: string;
  instanceCount: number;
  parsedClasses: ParsedClass[];
  tailwindConfig: any;
}

export function Picker({ componentName, instanceCount, parsedClasses, tailwindConfig }: PickerProps) {
  const [selectedClass, setSelectedClass] = useState<ParsedClass | null>(null);
  const [lockedOld, setLockedOld] = useState<string | null>(null);
  const [lockedNew, setLockedNew] = useState<string | null>(null);
  const [lockedProperty, setLockedProperty] = useState<string | null>(null);

  const groups = groupByCategory(parsedClasses);

  function handlePreview(oldClass: string, newClass: string) {
    if (lockedOld !== null) return;
    sendTo('overlay', { type: 'CLASS_PREVIEW', oldClass, newClass });
  }

  function handleRevert() {
    if (lockedOld !== null) return;
    sendTo('overlay', { type: 'CLASS_REVERT' });
  }

  function handleLock(cls: ParsedClass, newClass: string) {
    setLockedOld(cls.fullClass);
    setLockedNew(newClass);
    setLockedProperty(cls.prefix);
    sendTo('overlay', { type: 'CLASS_PREVIEW', oldClass: cls.fullClass, newClass });
  }

  function handleQueue() {
    if (lockedOld && lockedNew && lockedProperty) {
      sendTo('overlay', {
        type: 'CLASS_COMMIT',
        oldClass: lockedOld,
        newClass: lockedNew,
        property: lockedProperty,
      });
      setLockedOld(null);
      setLockedNew(null);
      setLockedProperty(null);
      setSelectedClass(null);
    }
  }

  function handleDiscard() {
    sendTo('overlay', { type: 'CLASS_REVERT' });
    setLockedOld(null);
    setLockedNew(null);
    setLockedProperty(null);
    setSelectedClass(null);
  }

  function handleChipClick(cls: ParsedClass) {
    if (lockedOld) {
      sendTo('overlay', { type: 'CLASS_REVERT' });
      setLockedOld(null);
      setLockedNew(null);
      setLockedProperty(null);
    }
    sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' });
    setSelectedClass(cls);
  }

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-[family-name:var(--font-display)] font-bold text-[13px] text-bv-text leading-tight">
          {componentName} <span className="font-[family-name:var(--font-ui)] font-normal text-bv-text-mid">— {instanceCount} instance{instanceCount !== 1 ? 's' : ''} on this page</span>
        </div>
        <ContainerSwitcher />
      </div>

      {Array.from(groups).map(([category, classes]) => (
        <div key={category}>
          <div className="mt-3 mb-1 flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-bv-teal opacity-50 shrink-0" />
            <span className="text-[9px] font-semibold uppercase tracking-[1px] text-bv-text-mid">
              {CATEGORY_LABELS[category] || category}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {classes.map((cls) => (
              <div
                key={cls.fullClass}
                className={`px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border transition-colors ${
                  selectedClass?.fullClass === cls.fullClass
                    ? 'border-bv-orange bg-bv-orange/9 text-bv-orange'
                    : 'bg-bv-surface text-bv-text-mid border-transparent hover:border-bv-teal hover:text-bv-teal'
                }`}
                onClick={() => handleChipClick(cls)}
              >
                {cls.fullClass}
              </div>
            ))}
          </div>

          {selectedClass && classes.some(c => c.fullClass === selectedClass.fullClass) && (
            <>
              {selectedClass.themeKey === 'colors' ? (
                <ColorGrid
                  prefix={selectedClass.prefix}
                  currentValue={selectedClass.value}
                  colors={tailwindConfig?.colors || {}}
                  locked={lockedOld !== null}
                  lockedValue={lockedNew}
                  onHover={(fullClass) => handlePreview(selectedClass.fullClass, fullClass)}
                  onLeave={handleRevert}
                  onClick={(fullClass) => handleLock(selectedClass, fullClass)}
                />
              ) : (
                <ScaleRow
                  prefix={selectedClass.prefix}
                  themeKey={selectedClass.themeKey}
                  currentClass={selectedClass.fullClass}
                  tailwindConfig={tailwindConfig}
                  locked={lockedOld !== null}
                  lockedValue={lockedNew}
                  onHover={(fullClass) => handlePreview(selectedClass.fullClass, fullClass)}
                  onLeave={handleRevert}
                  onClick={(fullClass) => handleLock(selectedClass, fullClass)}
                />
              )}

              {lockedOld !== null && (
                <div className="flex gap-2 mt-2">
                  <button
                    className="px-4 py-1.5 rounded-md border-none cursor-pointer text-[12px] font-semibold bg-bv-teal text-white hover:bg-bv-teal-dark transition-colors"
                    onClick={handleQueue}
                  >
                    Queue Change
                  </button>
                  <button
                    className="px-4 py-1.5 rounded-md cursor-pointer text-[12px] font-semibold bg-transparent border border-bv-border text-bv-text-mid hover:bg-bv-surface-hi hover:border-bv-teal hover:text-bv-text transition-colors"
                    onClick={handleDiscard}
                  >
                    Discard
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

    </div>
  );
}
