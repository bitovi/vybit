import { useState, useEffect, useRef } from 'react';
import type { ParsedClass } from '../../overlay/src/class-parser';
import { ColorGrid } from './components/ColorGrid';
import { ScaleScrubber } from './components/ScaleScrubber';
import { getScaleValues } from './components/getScaleValues';
import { BoxModel } from './components/BoxModel';
import { boxModelLayersFromClasses } from './components/BoxModel/layerUtils';
import type { LayerName, LayerState, SlotKey } from './components/BoxModel/types';
import { PropertySection } from './components/PropertySection';
import type { AvailableProperty } from './components/PropertySection/types';
import { sendTo } from './ws';
import type { PatchManager } from './hooks/usePatchManager';

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

/** Prefixes consumed by the box model — excluded from category sections */
const BOX_MODEL_PREFIXES = new Set([
  'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'ms-', 'me-',
  'p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'ps-', 'pe-',
  'border-', 'border-t-', 'border-r-', 'border-b-', 'border-l-',
  'outline-', 'outline-offset-',
  'rounded-', 'rounded-t-', 'rounded-r-', 'rounded-b-', 'rounded-l-',
  'rounded-tl-', 'rounded-tr-', 'rounded-br-', 'rounded-bl-',
  'gap-', 'gap-x-', 'gap-y-', 'space-x-', 'space-y-',
]);
/** Exact-match classes consumed by box model */
const BOX_MODEL_EXACT = new Set(['border', 'rounded']);

/** Available properties for the + button per section */
const TYPOGRAPHY_PROPERTIES: AvailableProperty[] = [
  { name: 'Font size', prefixHint: 'text-{size}', prefix: 'text-size' },
  { name: 'Font weight', prefixHint: 'font-*', prefix: 'font-' },
  { name: 'Text color', prefixHint: 'text-{color}', prefix: 'text-color' },
  { name: 'Text align', prefixHint: 'text-{align}', prefix: 'text-align' },
  { name: 'Line height', prefixHint: 'leading-*', prefix: 'leading-' },
  { name: 'Letter spacing', prefixHint: 'tracking-*', prefix: 'tracking-' },
];

const SIZING_PROPERTIES: AvailableProperty[] = [
  { name: 'Width', prefixHint: 'w-*', prefix: 'w-' },
  { name: 'Height', prefixHint: 'h-*', prefix: 'h-' },
  { name: 'Min width', prefixHint: 'min-w-*', prefix: 'min-w-' },
  { name: 'Max width', prefixHint: 'max-w-*', prefix: 'max-w-' },
  { name: 'Min height', prefixHint: 'min-h-*', prefix: 'min-h-' },
  { name: 'Max height', prefixHint: 'max-h-*', prefix: 'max-h-' },
  { name: 'Size', prefixHint: 'size-*', prefix: 'size-' },
];

const BACKGROUNDS_PROPERTIES: AvailableProperty[] = [
  { name: 'Background color', prefixHint: 'bg-{color}', prefix: 'bg-' },
];

/** Priority sections that always render (in order) */
const PRIORITY_SECTIONS = ['sizing', 'typography', 'color'] as const;

/** Maps addable-property prefix → { parserPrefix, themeKey } so we can render the right control */
const PENDING_PREFIX_CONFIG: Record<string, { parserPrefix: string; themeKey: string | null; valueType: 'scalar' | 'color' | 'enum' }> = {
  'w-':       { parserPrefix: 'w-',       themeKey: 'spacing',       valueType: 'scalar' },
  'h-':       { parserPrefix: 'h-',       themeKey: 'spacing',       valueType: 'scalar' },
  'min-w-':   { parserPrefix: 'min-w-',   themeKey: 'spacing',       valueType: 'scalar' },
  'max-w-':   { parserPrefix: 'max-w-',   themeKey: 'spacing',       valueType: 'scalar' },
  'min-h-':   { parserPrefix: 'min-h-',   themeKey: 'spacing',       valueType: 'scalar' },
  'max-h-':   { parserPrefix: 'max-h-',   themeKey: 'spacing',       valueType: 'scalar' },
  'size-':    { parserPrefix: 'size-',    themeKey: 'spacing',       valueType: 'scalar' },
  'font-':    { parserPrefix: 'font-',    themeKey: 'fontWeight',    valueType: 'scalar' },
  'text-size':  { parserPrefix: 'text-',  themeKey: 'fontSize',      valueType: 'scalar' },
  'text-color': { parserPrefix: 'text-',  themeKey: 'colors',        valueType: 'color' },
  'text-align': { parserPrefix: 'text-',  themeKey: null,            valueType: 'enum' },
  'leading-': { parserPrefix: 'leading-', themeKey: 'lineHeight',    valueType: 'scalar' },
  'tracking-':{ parserPrefix: 'tracking-',themeKey: 'letterSpacing', valueType: 'scalar' },
  'bg-':      { parserPrefix: 'bg-',      themeKey: 'colors',        valueType: 'color' },
};

/** Filter available properties to only those not already set, pending, or committed */
function filterAvailable(available: AvailableProperty[], classes: ParsedClass[], pending: Set<string>, staged?: Set<string>): AvailableProperty[] {
  const usedPrefixes = new Set(classes.map(c => c.prefix));
  return available.filter(p => {
    if (pending.has(p.prefix)) return false;
    if (staged?.has(p.prefix)) return false;
    const config = PENDING_PREFIX_CONFIG[p.prefix];
    const parserPrefix = config?.parserPrefix ?? p.prefix;
    return !usedPrefixes.has(parserPrefix);
  });
}

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
  patchManager: PatchManager;
}

export function Picker({ componentName, instanceCount, parsedClasses, tailwindConfig, patchManager }: PickerProps) {
  const [selectedClass, setSelectedClass] = useState<ParsedClass | null>(null);
  // Local overrides for BoxModel slots staged this session (key: "layer-slotKey" → fullClass)
  const [boxModelOverrides, setBoxModelOverrides] = useState<Map<string, string>>(new Map());
  // Prefixes activated via the "+" button but not yet staged
  const [pendingPrefixes, setPendingPrefixes] = useState<Set<string>>(new Set());

  // Reset local UI state when a different element is selected (classes string changes)
  // Note: patches persist across element switches — only local UI state resets
  const classesKeyRef = useRef(parsedClasses.map(c => c.fullClass).join(' '));
  const currentClassesKey = parsedClasses.map(c => c.fullClass).join(' ');
  useEffect(() => {
    if (classesKeyRef.current !== currentClassesKey) {
      classesKeyRef.current = currentClassesKey;
      setBoxModelOverrides(new Map());
      setPendingPrefixes(new Set());
    }
  });

  const elementKey = componentName;
  const stagedPatches = patchManager.patches.filter(p => p.status === 'staged');
  // Prefixes that have a staged patch (from + button additions with originalClass === '')
  const stagedPendingPrefixes = new Set(
    stagedPatches.filter(p => p.originalClass === '').map(p => p.property)
  );

  function applyBoxModelOverrides(layers: LayerState[]): LayerState[] {
    if (boxModelOverrides.size === 0) return layers;
    return layers.map(layer => {
      const shorthandOverride = boxModelOverrides.get(`${layer.layer}-shorthand`);
      const updatedSlots = layer.slots.map(slot => {
        const override = boxModelOverrides.get(`${layer.layer}-${slot.key}`);
        return override !== undefined ? { ...slot, value: override } : slot;
      });
      const newShorthandValue = shorthandOverride ?? layer.shorthandValue;
      let classState = layer.classState;
      if (shorthandOverride !== undefined) {
        const hasSlotValues = updatedSlots.some(s => s.value != null);
        classState = hasSlotValues ? 'mixed' : 'shorthand';
      }
      return { ...layer, shorthandValue: newShorthandValue, classState, slots: updatedSlots };
    });
  }

  const groups = groupByCategory(parsedClasses);

  function handlePreview(oldClass: string, newClass: string) {
    patchManager.preview(oldClass, newClass);
  }

  function handleRevert() {
    patchManager.revertPreview();
  }

  function handleStage(property: string, originalClass: string, newClass: string) {
    patchManager.stage(elementKey, property, originalClass, newClass);
  }

  function handleChipClick(cls: ParsedClass) {
    patchManager.revertPreview();
    sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' });
    setSelectedClass(cls);
  }

  function handleScrubberPreview(cls: ParsedClass, newClass: string) {
    patchManager.preview(cls.fullClass, newClass);
  }

  function handleScrubberRevert(_cls: ParsedClass) {
    patchManager.revertPreview();
  }

  function handleAddProperty(prefix: string) {
    setPendingPrefixes(prev => new Set(prev).add(prefix));
  }

  function handlePendingPreview(_prefix: string, newClass: string) {
    patchManager.preview('', newClass);
  }

  function handlePendingRevert(_prefix: string) {
    patchManager.revertPreview();
  }

  function handlePendingStage(prefix: string, newClass: string) {
    const config = PENDING_PREFIX_CONFIG[prefix];
    patchManager.stage(elementKey, config?.parserPrefix ?? prefix, '', newClass);
    // Move from pending ghost to staged
    setPendingPrefixes(prev => {
      const next = new Set(prev);
      next.delete(prefix);
      return next;
    });
  }

  return (
    <div className="p-3">
      {/* ── Box Model ─────────────────────────────────────────── */}
      <div className="mt-3 mb-1 flex items-center gap-1.5">
        <span className="w-[5px] h-[5px] rounded-full bg-bv-teal opacity-50 shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-[1px] text-bv-text-mid">Box Model</span>
      </div>
      <div className="mb-4">
        <BoxModel
          layers={applyBoxModelOverrides(boxModelLayersFromClasses(parsedClasses, tailwindConfig))}
          onEditStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
          onSlotHover={(layer: LayerName, slotKey: SlotKey | 'shorthand', value: string | null) => {
            if (value === null) {
              patchManager.revertPreview();
            } else {
              const overrideKey = `${layer}-${slotKey}`;
              const baseLayer = boxModelLayersFromClasses(parsedClasses, tailwindConfig).find(l => l.layer === layer);
              const currentClass = slotKey === 'shorthand'
                ? (boxModelOverrides.get(overrideKey) ?? baseLayer?.shorthandValue)
                : (boxModelOverrides.get(overrideKey) ?? baseLayer?.slots.find(s => s.key === slotKey)?.value);
              patchManager.preview(currentClass ?? '', value);
            }
          }}
          onSlotChange={(layer: LayerName, slotKey: SlotKey | 'shorthand', value: string) => {
            const overrideKey = `${layer}-${slotKey}`;
            const baseLayer = boxModelLayersFromClasses(parsedClasses, tailwindConfig).find(l => l.layer === layer);
            const currentClass = slotKey === 'shorthand'
              ? (boxModelOverrides.get(overrideKey) ?? baseLayer?.shorthandValue)
              : (boxModelOverrides.get(overrideKey) ?? baseLayer?.slots.find(s => s.key === slotKey)?.value);
            handleStage(`${layer}-${slotKey}`, currentClass ?? '', value);
            // Record locally so the slot updates immediately without waiting for re-selection
            setBoxModelOverrides(prev => new Map(prev).set(overrideKey, value));
          }}
        />
      </div>

      {/* ── Priority Sections (always visible) ─────────────── */}
      {PRIORITY_SECTIONS.map((category) => {
        const rawClasses = groups.get(category) || [];
        const classes = rawClasses.filter(c => !BOX_MODEL_PREFIXES.has(c.prefix) && !BOX_MODEL_EXACT.has(c.fullClass));
        const availableMap: Record<string, AvailableProperty[]> = {
          typography: TYPOGRAPHY_PROPERTIES,
          sizing: SIZING_PROPERTIES,
          color: BACKGROUNDS_PROPERTIES,
        };
        const available = filterAvailable(availableMap[category] || [], classes, pendingPrefixes, stagedPendingPrefixes);
        const sectionPending = (availableMap[category] || [])
          .filter(p => pendingPrefixes.has(p.prefix))
          .map(p => p.prefix);
        const sectionStaged = (availableMap[category] || [])
          .filter(p => stagedPendingPrefixes.has(p.prefix))
          .map(p => p.prefix);

        return (
          <PropertySection
            key={category}
            label={category === 'color' ? 'Backgrounds' : (CATEGORY_LABELS[category] || category)}
            availableProperties={available}
            onAddProperty={handleAddProperty}
            isEmpty={classes.length === 0 && sectionPending.length === 0 && sectionStaged.length === 0}
          >
            {classes.map((cls) => {
              if (cls.valueType === 'scalar') {
                const scaleValues = getScaleValues(cls.prefix, cls.themeKey, tailwindConfig);
                if (scaleValues.length > 0) {
                  const stagedValue = stagedPatches.find(p => p.property === cls.prefix)?.newClass ?? null;
                  return (
                    <ScaleScrubber
                      key={cls.fullClass}
                      values={scaleValues}
                      currentValue={cls.fullClass}
                      lockedValue={stagedValue}
                      locked={false}
                      onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                      onHover={(newClass) => handleScrubberPreview(cls, newClass)}
                      onLeave={() => handleScrubberRevert(cls)}
                      onClick={(newClass) => handleStage(cls.prefix, cls.fullClass, newClass)}
                    />
                  );
                }
              }
              return (
                <div
                  key={cls.fullClass}
                  className={`px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border transition-colors ${
                    selectedClass?.fullClass === cls.fullClass
                      ? 'border-bv-border bg-bv-surface-hi text-bv-text'
                      : 'bg-bv-surface text-bv-text-mid border-transparent hover:border-bv-teal hover:text-bv-teal'
                  }`}
                  onClick={() => handleChipClick(cls)}
                >
                  {cls.fullClass}
                </div>
              );
            })}

            {/* Staged pending values (from + button, user selected a value) */}
            {(availableMap[category] || [])
              .filter(p => stagedPendingPrefixes.has(p.prefix))
              .map(p => {
                const config = PENDING_PREFIX_CONFIG[p.prefix];
                if (!config || config.valueType !== 'scalar') return null;
                const scaleValues = getScaleValues(config.parserPrefix, config.themeKey, tailwindConfig);
                if (scaleValues.length === 0) return null;
                const patch = stagedPatches.find(pt => pt.property === (config.parserPrefix ?? p.prefix));
                return (
                  <ScaleScrubber
                    key={`staged-${p.prefix}`}
                    values={scaleValues}
                    currentValue={patch?.newClass ?? scaleValues[Math.floor(scaleValues.length / 2)]}
                    lockedValue={patch?.newClass ?? null}
                    locked={false}
                    onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                    onHover={(newClass) => handlePendingPreview(p.prefix, newClass)}
                    onLeave={() => handlePendingRevert(p.prefix)}
                    onClick={(newClass) => handlePendingStage(p.prefix, newClass)}
                  />
                );
              })}

            {/* Pending ghost scrubbers from + button (not yet staged) */}
            {sectionPending.map(prefix => {
              const config = PENDING_PREFIX_CONFIG[prefix];
              if (!config) return null;
              if (config.valueType === 'scalar') {
                const scaleValues = getScaleValues(config.parserPrefix, config.themeKey, tailwindConfig);
                if (scaleValues.length > 0) {
                  return (
                    <ScaleScrubber
                      key={`pending-${prefix}`}
                      values={scaleValues}
                      currentValue={scaleValues[Math.floor(scaleValues.length / 2)]}
                      lockedValue={null}
                      locked={false}
                      ghost
                      onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                      onHover={(newClass) => handlePendingPreview(prefix, newClass)}
                      onLeave={() => handlePendingRevert(prefix)}
                      onClick={(newClass) => handlePendingStage(prefix, newClass)}
                    />
                  );
                }
              }
              if (config.valueType === 'color') {
                return (
                  <div
                    key={`pending-${prefix}`}
                    data-testid={`pending-ghost-${prefix}`}
                    className="px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border border-dashed border-bv-border text-bv-muted hover:border-bv-teal hover:text-bv-teal transition-colors"
                    onClick={() => {
                      setSelectedClass({
                        category: 'color',
                        valueType: 'color',
                        prefix: config.parserPrefix,
                        value: '',
                        fullClass: '',
                        themeKey: 'colors',
                      });
                    }}
                  >
                    {config.parserPrefix}color
                  </div>
                );
              }
              return null;
            })}

            {selectedClass && classes.some(c => c.fullClass === selectedClass.fullClass) && selectedClass.valueType === 'color' && (
              <ColorGrid
                prefix={selectedClass.prefix}
                currentValue={selectedClass.value}
                colors={tailwindConfig?.colors || {}}
                locked={false}
                lockedValue={stagedPatches.find(p => p.property === selectedClass.prefix)?.newClass ?? null}
                onHover={(fullClass) => handlePreview(selectedClass.fullClass, fullClass)}
                onLeave={handleRevert}
                onClick={(fullClass) => handleStage(selectedClass.prefix, selectedClass.fullClass, fullClass)}
              />
            )}
          </PropertySection>
        );
      })}

      {/* ── Remaining Categories ───────────────────────────── */}
      {Array.from(groups)
        .filter(([category]) => !(PRIORITY_SECTIONS as readonly string[]).includes(category))
        .map(([category, rawClasses]) => {
          const classes = rawClasses.filter(c => !BOX_MODEL_PREFIXES.has(c.prefix) && !BOX_MODEL_EXACT.has(c.fullClass));
          if (classes.length === 0) return null;
          return (
            <div key={category}>
              <div className="mt-3 mb-1 flex items-center gap-1.5">
                <span className="w-[5px] h-[5px] rounded-full bg-bv-teal opacity-50 shrink-0" />
                <span className="text-[9px] font-semibold uppercase tracking-[1px] text-bv-text-mid">
                  {CATEGORY_LABELS[category] || category}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {classes.map((cls) => {
                  if (cls.valueType === 'scalar') {
                    const scaleValues = getScaleValues(cls.prefix, cls.themeKey, tailwindConfig);
                    if (scaleValues.length > 0) {
                      const stagedValue = stagedPatches.find(p => p.property === cls.prefix)?.newClass ?? null;
                      return (
                        <ScaleScrubber
                          key={cls.fullClass}
                          values={scaleValues}
                          currentValue={cls.fullClass}
                          lockedValue={stagedValue}
                          locked={false}
                          onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                          onHover={(newClass) => handleScrubberPreview(cls, newClass)}
                          onLeave={() => handleScrubberRevert(cls)}
                          onClick={(newClass) => handleStage(cls.prefix, cls.fullClass, newClass)}
                        />
                      );
                    }
                  }
                  return (
                    <div
                      key={cls.fullClass}
                      className={`px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border transition-colors ${
                        selectedClass?.fullClass === cls.fullClass
                          ? 'border-bv-border bg-bv-surface-hi text-bv-text'
                          : 'bg-bv-surface text-bv-text-mid border-transparent hover:border-bv-teal hover:text-bv-teal'
                      }`}
                      onClick={() => handleChipClick(cls)}
                    >
                      {cls.fullClass}
                    </div>
                  );
                })}
              </div>

              {selectedClass && classes.some(c => c.fullClass === selectedClass.fullClass) && selectedClass.valueType === 'color' && (
                <ColorGrid
                  prefix={selectedClass.prefix}
                  currentValue={selectedClass.value}
                  colors={tailwindConfig?.colors || {}}
                  locked={false}
                  lockedValue={stagedPatches.find(p => p.property === selectedClass.prefix)?.newClass ?? null}
                  onHover={(fullClass) => handlePreview(selectedClass.fullClass, fullClass)}
                  onLeave={handleRevert}
                  onClick={(fullClass) => handleStage(selectedClass.prefix, selectedClass.fullClass, fullClass)}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}
