import { useState, useEffect, useRef } from 'react';
import { useFloating, offset, flip, shift, size, autoUpdate, FloatingPortal, useDismiss, useInteractions } from '@floating-ui/react';
import type { ParsedToken } from '../../overlay/src/grammar';
import { PROPERTY_RULES, type Category, buildEnumGroupsFromRules, buildAddablePropertiesFromRules } from '../../overlay/src/propertyRules';
import { ColorGrid } from './components/ColorGrid';
import { ScaleScrubber } from './components/ScaleScrubber';
import { getScaleValues } from './components/getScaleValues';
import { BoxModel } from './components/BoxModel';
import { boxModelLayersFromClasses } from './components/BoxModel/layerUtils';
import type { LayerName, LayerState, SlotKey } from './components/BoxModel/types';
import { CornerModel } from './components/CornerModel';
import type { CornerModelState, SlotKey as CornerSlotKey } from './components/CornerModel';
import { PropertySection } from './components/PropertySection';
import type { AvailableProperty } from './components/PropertySection/types';
import { GradientEditor, parsedClassesToGradientEditorProps } from './components/GradientEditor';
import { FlexDirection } from './components/FlexDirection';
import type { FlexDirectionValue } from './components/FlexDirection';
import { FlexJustify } from './components/FlexJustify';
import { FlexAlign } from './components/FlexAlign';
import { FlexWrap } from './components/FlexWrap';
import type { FlexWrapValue } from './components/FlexWrap';
import { sendTo } from './ws';
import type { PatchManager } from './hooks/usePatchManager';

const SECTION_LABELS: Record<string, string> = {
  spacing: 'Spacing',
  sizing: 'Sizing',
  typography: 'Typography',
  color: 'Backgrounds',
  borders: 'Borders & Radius',
  effects: 'Effects',
  layout: 'Layout',
  flexbox: 'Flexbox & Grid',
  overflow: 'Overflow',
};

/**
 * Ordered list of sections to render (spacing handled by BoxModel; overflow not shown yet).
 * Sections always render, even when empty, so users can always add via [+].
 */
const ALL_SECTIONS = ['borders', 'sizing', 'typography', 'color', 'flexbox', 'effects', 'layout'];

/** Derives the class prefix string for building new class names (e.g. 'py-2' → 'py-'). */
function tokenClassPrefix(t: ParsedToken): string {
  const val = t.scale ?? t.color ?? t.style ?? t.align ?? t.size ?? t.value;
  if (val) return t.fullClass.slice(0, t.fullClass.length - val.length);
  return t.property + '-';
}

/** Returns true for tokens consumed by BoxModel, CornerModel, or GradientEditor (not rendered as chips). */
function isCompositeConsumed(t: ParsedToken): boolean {
  if (t.section === 'spacing') return true;
  if (t.property === 'border' && !t.style && !t.color) return true;
  if (t.property === 'rounded') return true; // consumed by CornerModel
  if (t.property === 'bg' || t.property === 'bg-gradient-to' || t.property === 'from' || t.property === 'via' || t.property === 'to') return true;
  return false;
}

const RADIUS_SCALE = [
  'rounded-none', 'rounded-sm', 'rounded', 'rounded-md',
  'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',
];

function cornerScale(prefix: string) {
  return [
    `${prefix}-none`, `${prefix}-sm`, prefix,
    `${prefix}-md`, `${prefix}-lg`, `${prefix}-xl`,
    `${prefix}-2xl`, `${prefix}-3xl`, `${prefix}-full`,
  ];
}

/** Builds CornerModelState from the current parsedClasses */
function cornerModelStateFromClasses(classes: ParsedToken[]): CornerModelState {
  const rounded = classes.filter(c => c.property === 'rounded');

  // Map fullClass → slot key
  const PREFIXES: { prefix: RegExp; key: CornerSlotKey }[] = [
    { prefix: /^rounded-tl(-|$)/, key: 'tl' },
    { prefix: /^rounded-tr(-|$)/, key: 'tr' },
    { prefix: /^rounded-br(-|$)/, key: 'br' },
    { prefix: /^rounded-bl(-|$)/, key: 'bl' },
    { prefix: /^rounded-t(-|$)/,  key: 't' },
    { prefix: /^rounded-r(-|$)/,  key: 'r' },
    { prefix: /^rounded-b(-|$)/,  key: 'b' },
    { prefix: /^rounded-l(-|$)/,  key: 'l' },
  ];

  const slotValues = new Map<CornerSlotKey, string>();
  let shorthandValue: string | null = null;

  for (const cls of rounded) {
    const fc = cls.fullClass;
    const match = PREFIXES.find(p => p.prefix.test(fc));
    if (match) {
      slotValues.set(match.key, fc);
    } else {
      // bare rounded or rounded-{size} with no side/corner → shorthand
      shorthandValue = fc;
    }
  }

  const allKeys: CornerSlotKey[] = ['all', 't', 'r', 'b', 'l', 'tl', 'tr', 'br', 'bl'];
  return {
    shorthandValue,
    shorthandScaleValues: RADIUS_SCALE,
    slots: allKeys.map(key => ({
      key,
      value: key === 'all' ? shorthandValue : (slotValues.get(key) ?? null),
      placeholder: key,
      scaleValues: key === 'all' ? RADIUS_SCALE : cornerScale(`rounded-${key}`),
    })),
  };
}

/** Maps each class token → its enum alternatives + staging property key. Built from propertyRules. */
const ENUM_GROUPS = buildEnumGroupsFromRules();

/** Per-category [+] menu entries, generated from propertyRules addable entries. */
const ADDABLE_PROPERTIES_MAP = buildAddablePropertiesFromRules();

/**
 * Typography properties that need virtual prefixes (text- is ambiguous: font-size vs color vs align).
 * These are the only special cases not auto-generated from PROPERTY_RULES.
 */
const TYPOGRAPHY_ADDABLE_SPECIALS: Record<string, { scaleName: string | null; valueType: 'scalar' | 'color' | 'enum'; enumAlts?: string[] }> = {
  'text-size':  { scaleName: 'fontSize', valueType: 'scalar' },
  'text-color': { scaleName: null,       valueType: 'color' },
};

/** Augment the typography section with the virtual specials not in PROPERTY_RULES. */
ADDABLE_PROPERTIES_MAP.typography.unshift(
	{ name: "Font size", prefixHint: "text-sm/base/lg/…", prefix: "text-size" },
	{ name: "Text color", prefixHint: "text-{color}", prefix: "text-color" },
);

/** Look up pending/staging config for a prefix. Covers PROPERTY_RULES entries and typography specials. */
function getPendingConfig(prefix: string): { scaleName: string | null; valueType: 'scalar' | 'color' | 'enum'; enumAlts?: string[]; stagingKey: string } | null {
  // Typography specials (virtual prefixes)
  const special = TYPOGRAPHY_ADDABLE_SPECIALS[prefix];
  if (special) return { ...special, stagingKey: prefix };

  // PROPERTY_RULES lookup by propertyKey (find the canonical entry that has this propertyKey)
  const ruleEntry = Object.entries(PROPERTY_RULES).find(
    ([key, r]) => (r.propertyKey ?? key.replace(/-$/g, '')) === prefix && r.addable
  );
  if (ruleEntry) {
    const [_key, rule] = ruleEntry;
    return {
      scaleName: rule.themeKey,
      valueType: rule.valueType,
      enumAlts: rule.enumAlts,
      stagingKey: prefix,
    };
  }

  // Direct PROPERTY_RULES lookup (for scalar prefixes like 'w-', 'h-', 'font-', etc.)
  const directRule = PROPERTY_RULES[prefix];
  if (directRule) {
    return {
      scaleName: directRule.themeKey,
      valueType: directRule.valueType,
      enumAlts: directRule.enumAlts,
      stagingKey: prefix.replace(/-$/g, ''),
    };
  }

	return null;
}

function filterAvailable(
  available: AvailableProperty[],
  classes: ParsedToken[],
  pending: Set<string>,
  staged?: Set<string>
): AvailableProperty[] {
  const usedFullClasses = new Set(classes.map(c => c.fullClass));
  const usedProperties = new Set(classes.map(c => c.property));
  return available.filter(p => {
    if (pending.has(p.prefix)) return false;
    if (staged?.has(p.prefix)) return false;
    const config = getPendingConfig(p.prefix);
    if (config?.valueType === 'enum' && config.enumAlts) {
      return !config.enumAlts.some(alt => usedFullClasses.has(alt));
    }
    // For scalars/colors, check if the property is already used
    if (config && config.valueType !== 'enum') {
      // text-size and text-color share the 'text' property — check scaleName/color field
      if (p.prefix === 'text-size') return !classes.some(c => c.property === 'text' && c.scaleName === 'fontSize');
      if (p.prefix === 'text-color') return !classes.some(c => c.property === 'text' && c.color !== undefined);
    }
    return !usedProperties.has(p.prefix.replace(/-$/g, ''));
  });
}

function groupBySection(classes: ParsedToken[]): Map<string, ParsedToken[]> {
  const groups = new Map<string, ParsedToken[]>();
  for (const cls of classes) {
    const section = cls.section ?? 'unknown';
    const list = groups.get(section) || [];
    list.push(cls);
    groups.set(section, list);
  }
  return groups;
}

interface PickerProps {
  componentName: string;
  instanceCount: number;
  parsedClasses: ParsedToken[];
  tailwindConfig: any;
  patchManager: PatchManager;
}

export function Picker({ componentName, instanceCount, parsedClasses, tailwindConfig, patchManager }: PickerProps) {
  const [selectedClass, setSelectedClass] = useState<ParsedToken | null>(null);
  // Local overrides for BoxModel slots staged this session (key: "layer-slotKey" → fullClass)
  const [boxModelOverrides, setBoxModelOverrides] = useState<Map<string, string>>(new Map());
  // Local overrides for CornerModel slots staged this session.
  // string = overridden value, null = explicitly removed, absent = no change from parsedClasses
  const [cornerOverrides, setCornerOverrides] = useState<Map<CornerSlotKey, string | null>>(new Map());
  // Active color picker for a box model color slot
  const [boxModelColorPicker, setBoxModelColorPicker] = useState<{ layer: LayerName; prefix: string; currentClass: string; staged: boolean; anchorEl: Element } | null>(null);
  // Active color picker for a property chip (Backgrounds, etc.)
  const [chipColorPicker, setChipColorPicker] = useState<{ cls: ParsedToken; anchorEl: Element } | null>(null);
  // Tracks the last hovered color swatch so onLeave can snap back to the staged color
  const boxModelHoveredColorRef = useRef<string | null>(null);

	const {
		refs: colorPickerRefs,
		floatingStyles: colorPickerStyles,
		context: colorPickerContext,
	} = useFloating({
		open: boxModelColorPicker !== null,
		onOpenChange: (open) => {
			if (!open) {
				setBoxModelColorPicker(null);
				patchManager.revertPreview();
			}
		},
		strategy: "fixed",
		placement: "bottom-start",
		middleware: [
			offset(4),
			flip(),
			shift({ padding: 8 }),
			size({
				apply({ availableHeight, elements }) {
					Object.assign(elements.floating.style, {
						maxHeight: `${availableHeight}px`,
					});
				},
				padding: 8,
			}),
		],
		whileElementsMounted: autoUpdate,
	});
	const colorPickerDismiss = useDismiss(colorPickerContext);
	const { getFloatingProps: getColorPickerFloatingProps } = useInteractions([
		colorPickerDismiss,
	]);

	useEffect(() => {
		if (boxModelColorPicker?.anchorEl) {
			colorPickerRefs.setReference(boxModelColorPicker.anchorEl);
		}
	}, [boxModelColorPicker?.anchorEl]);

	const {
		refs: chipColorPickerRefs,
		floatingStyles: chipColorPickerStyles,
		context: chipColorPickerContext,
	} = useFloating({
		open: chipColorPicker !== null,
		onOpenChange: (open) => {
			if (!open) {
				setChipColorPicker(null);
				patchManager.revertPreview();
			}
		},
		strategy: "fixed",
		placement: "bottom-start",
		middleware: [
			offset(4),
			flip(),
			shift({ padding: 8 }),
			size({
				apply({ availableHeight, elements }) {
					Object.assign(elements.floating.style, {
						maxHeight: `${availableHeight}px`,
					});
				},
				padding: 8,
			}),
		],
		whileElementsMounted: autoUpdate,
	});
	const chipColorPickerDismiss = useDismiss(chipColorPickerContext);
	const { getFloatingProps: getChipColorPickerFloatingProps } = useInteractions(
		[chipColorPickerDismiss],
	);

	useEffect(() => {
		if (chipColorPicker?.anchorEl) {
			chipColorPickerRefs.setReference(chipColorPicker.anchorEl);
		}
	}, [chipColorPicker?.anchorEl]);

	// Prefixes activated via the "+" button but not yet staged
	const [pendingPrefixes, setPendingPrefixes] = useState<Set<string>>(
		new Set(),
	);
	const [boxModelCollapsed, setBoxModelCollapsed] = useState(false);

  // Reset local UI state when a different element is selected (classes string changes)
  // Note: patches persist across element switches — only local UI state resets
  const classesKeyRef = useRef(parsedClasses.map(c => c.fullClass).join(' '));
  const currentClassesKey = parsedClasses.map(c => c.fullClass).join(' ');
  useEffect(() => {
    if (classesKeyRef.current !== currentClassesKey) {
      classesKeyRef.current = currentClassesKey;
      patchManager.revertPreview();
      setBoxModelOverrides(new Map());
      setCornerOverrides(new Map());
      setBoxModelColorPicker(null);
      setChipColorPicker(null);
      setPendingPrefixes(new Set());
    }
  });

	const elementKey = componentName;
	const stagedPatches = patchManager.patches.filter(
		(p) => p.status === "staged",
	);
	// Prefixes that have a staged patch (from + button additions with originalClass === '')
	const stagedPendingPrefixes = new Set(
		stagedPatches.filter((p) => p.originalClass === "").map((p) => p.property),
	);

  /**
   * Resolves the effective state for a CSS property by merging the element's
   * current parsed classes with any staged patches.
   */
  function resolvePropertyState(property: string, token: ParsedToken | undefined) {
    const staged = stagedPatches.find(p => p.property === property);
    const originalClass = token?.fullClass ?? staged?.originalClass ?? '';
    const effectiveClass = staged?.newClass ?? token?.fullClass ?? '';
    const hasValue = effectiveClass !== '';
    return { originalClass, effectiveClass, hasValue };
  }

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

  function applyCornerOverrides(state: CornerModelState): CornerModelState {
    if (cornerOverrides.size === 0) return state;
    const allOverride = cornerOverrides.get('all');
    return {
      ...state,
      shorthandValue: allOverride === undefined ? state.shorthandValue : allOverride,
      slots: state.slots.map(s => {
        const override = cornerOverrides.get(s.key);
        return override === undefined ? s : { ...s, value: override };
      }),
    };
  }

  const groups = groupBySection(parsedClasses);

	function handlePreview(oldClass: string, newClass: string) {
		patchManager.preview(oldClass, newClass);
	}

	function handleRevert() {
		patchManager.revertPreview();
	}

	function handleStage(
		property: string,
		originalClass: string,
		newClass: string,
	) {
		patchManager.stage(elementKey, property, originalClass, newClass);
	}

	function handleGradientStage(oldClass: string, newClass: string) {
		const cls = oldClass || newClass;
		const property = cls.startsWith("bg-gradient-to-")
			? "bg-gradient-to-"
			: cls.startsWith("from-")
				? "from-"
				: cls.startsWith("via-")
					? "via-"
					: cls.startsWith("to-")
						? "to-"
						: "bg-";
		handleStage(property, oldClass, newClass);
	}

  function handleChipClick(cls: ParsedToken, anchorEl?: Element) {
    patchManager.revertPreview();
    sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' });
    if (cls.color !== undefined && anchorEl) {
      setChipColorPicker(prev => prev?.cls.fullClass === cls.fullClass ? null : { cls, anchorEl });
      setSelectedClass(null);
    } else {
      setChipColorPicker(null);
      setSelectedClass(cls);
    }
  }

  function handleScrubberPreview(cls: ParsedToken, newClass: string) {
    patchManager.preview(cls.fullClass, newClass);
  }

  function handleScrubberRevert(_cls: ParsedToken) {
    patchManager.revertPreview();
  }

	function handleAddProperty(prefix: string) {
		setPendingPrefixes((prev) => new Set(prev).add(prefix));
	}

	function handlePendingPreview(_prefix: string, newClass: string) {
		patchManager.preview("", newClass);
	}

	function handlePendingRevert(_prefix: string) {
		patchManager.revertPreview();
	}

	function handlePendingStage(prefix: string, newClass: string) {
		const config = getPendingConfig(prefix);
		patchManager.stage(elementKey, config?.stagingKey ?? prefix, "", newClass);
		// Move from pending ghost to staged
		setPendingPrefixes((prev) => {
			const next = new Set(prev);
			next.delete(prefix);
			return next;
		});
	}

	return (
		<div className="divide-y divide-bv-border">
			{/* ── Box Model ─────────────────────────────────────────── */}
			<div className="px-4 py-3">
				<div
					className="flex items-center gap-1.5 cursor-pointer select-none"
					onClick={() => setBoxModelCollapsed((c) => !c)}
				>
					<svg
						className={`w-3 h-3 text-bv-muted transition-transform ${boxModelCollapsed ? "" : "rotate-90"}`}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
					</svg>
					<span className="text-[10px] font-semibold text-bv-text">
						Box model
					</span>
				</div>
				<div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out ${boxModelCollapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"}`}>
				<div className="mt-3">
					<BoxModel
						layers={applyBoxModelOverrides(
							boxModelLayersFromClasses(parsedClasses, tailwindConfig),
						)}
						onEditStart={() => {
							sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" });
							setBoxModelColorPicker(null);
						}}
						onSlotClick={(
							layer: LayerName,
							slotKey: SlotKey | "shorthand",
							anchorEl?: Element,
						) => {
							if (slotKey !== "color" || !anchorEl) {
								setBoxModelColorPicker(null);
								return;
							}
							const layerState = boxModelLayersFromClasses(
								parsedClasses,
								tailwindConfig,
							).find((l) => l.layer === layer);
							const overrideKey = `${layer}-color`;
							const currentClass =
								boxModelOverrides.get(overrideKey) ??
								layerState?.slots.find((s) => s.key === "color")?.value ??
								"";
							const prefix = layer === "outline" ? "outline-" : "border-";
							setBoxModelColorPicker((prev) =>
								prev?.layer === layer
									? null
									: { layer, prefix, currentClass, staged: false, anchorEl },
							);
						}}
						onSlotHover={(
							layer: LayerName,
							slotKey: SlotKey | "shorthand",
							value: string | null,
						) => {
							if (value === null) {
								patchManager.revertPreview();
							} else {
								const overrideKey = `${layer}-${slotKey}`;
								const baseLayer = boxModelLayersFromClasses(
									parsedClasses,
									tailwindConfig,
								).find((l) => l.layer === layer);
								const currentClass =
									slotKey === "shorthand"
										? (boxModelOverrides.get(overrideKey) ??
											baseLayer?.shorthandValue)
										: (boxModelOverrides.get(overrideKey) ??
											baseLayer?.slots.find((s) => s.key === slotKey)?.value);
								patchManager.preview(currentClass ?? "", value);
							}
						}}
						onSlotChange={(
							layer: LayerName,
							slotKey: SlotKey | "shorthand",
							value: string,
						) => {
							const overrideKey = `${layer}-${slotKey}`;
							const baseLayer = boxModelLayersFromClasses(
								parsedClasses,
								tailwindConfig,
							).find((l) => l.layer === layer);
							const currentClass =
								slotKey === "shorthand"
									? (boxModelOverrides.get(overrideKey) ??
										baseLayer?.shorthandValue)
									: (boxModelOverrides.get(overrideKey) ??
										baseLayer?.slots.find((s) => s.key === slotKey)?.value);
							handleStage(`${layer}-${slotKey}`, currentClass ?? "", value);
							// Record locally so the slot updates immediately without waiting for re-selection
							setBoxModelOverrides((prev) =>
								new Map(prev).set(overrideKey, value),
							);
						}}
						onSlotRemoveHover={(
							layer: LayerName,
							slotKey: SlotKey | "shorthand",
						) => {
							const overrideKey = `${layer}-${slotKey}`;
							const baseLayer = boxModelLayersFromClasses(
								parsedClasses,
								tailwindConfig,
							).find((l) => l.layer === layer);
							const currentClass =
								slotKey === "shorthand"
									? (boxModelOverrides.get(overrideKey) ??
										baseLayer?.shorthandValue)
									: (boxModelOverrides.get(overrideKey) ??
										baseLayer?.slots.find((s) => s.key === slotKey)?.value);
							if (currentClass) patchManager.preview(currentClass, "");
						}}
						onSlotRemove={(
							layer: LayerName,
							slotKey: SlotKey | "shorthand",
						) => {
							const overrideKey = `${layer}-${slotKey}`;
							const baseLayer = boxModelLayersFromClasses(
								parsedClasses,
								tailwindConfig,
							).find((l) => l.layer === layer);
							const currentClass =
								slotKey === "shorthand"
									? (boxModelOverrides.get(overrideKey) ??
										baseLayer?.shorthandValue)
									: (boxModelOverrides.get(overrideKey) ??
										baseLayer?.slots.find((s) => s.key === slotKey)?.value);
							if (currentClass) {
								handleStage(`${layer}-${slotKey}`, currentClass, "");
								setBoxModelOverrides((prev) => {
									const m = new Map(prev);
									m.delete(overrideKey);
									return m;
								});
							}
						}}
					/>
					{boxModelColorPicker && (
						<FloatingPortal>
							<div
								ref={colorPickerRefs.setFloating}
								style={{
									...colorPickerStyles,
									zIndex: 9999,
									overflowY: "auto",
								}}
								{...getColorPickerFloatingProps()}
							>
								<ColorGrid
									prefix={boxModelColorPicker.prefix}
									currentValue={
										boxModelColorPicker.currentClass.startsWith(
											boxModelColorPicker.prefix,
										)
											? boxModelColorPicker.currentClass.slice(
													boxModelColorPicker.prefix.length,
												)
											: ""
									}
									colors={tailwindConfig?.colors || {}}
									locked={false}
									lockedValue={
										stagedPatches.find(
											(p) => p.property === boxModelColorPicker.prefix,
										)?.newClass ?? null
									}
									onHover={(fullClass) => {
										boxModelHoveredColorRef.current = fullClass;
										patchManager.preview(
											boxModelColorPicker.currentClass,
											fullClass,
										);
									}}
									onLeave={() => {
										if (
											boxModelColorPicker.staged &&
											boxModelHoveredColorRef.current
										) {
											// Snap back from last hovered to the staged color
											patchManager.preview(
												boxModelHoveredColorRef.current,
												boxModelColorPicker.currentClass,
											);
											boxModelHoveredColorRef.current = null;
										} else {
											patchManager.revertPreview();
										}
									}}
									onClick={(fullClass) => {
										const overrideKey = `${boxModelColorPicker.layer}-color`;
										handleStage(
											boxModelColorPicker.prefix,
											boxModelColorPicker.currentClass,
											fullClass,
										);
										setBoxModelOverrides((prev) =>
											new Map(prev).set(overrideKey, fullClass),
										);
										setBoxModelColorPicker((prev) =>
											prev
												? { ...prev, currentClass: fullClass, staged: true }
												: null,
										);
									}}
								/>
							</div>
						</FloatingPortal>
					)}
				</div>
				</div>
			</div>



      {chipColorPicker && (
        <FloatingPortal>
          <div ref={chipColorPickerRefs.setFloating} style={{ ...chipColorPickerStyles, zIndex: 9999, overflowY: 'auto' }} {...getChipColorPickerFloatingProps()}>
            <ColorGrid
              prefix={tokenClassPrefix(chipColorPicker.cls)}
              currentValue={chipColorPicker.cls.color ?? ''}
              colors={tailwindConfig?.colors || {}}
              locked={false}
              lockedValue={stagedPatches.find(p => p.property === chipColorPicker.cls.property)?.newClass ?? null}
              onHover={(fullClass) => handlePreview(chipColorPicker.cls.fullClass, fullClass)}
              onLeave={handleRevert}
              onClick={(fullClass) => handleStage(chipColorPicker.cls.property, chipColorPicker.cls.fullClass, fullClass)}
              onRemoveHover={() => handlePreview(chipColorPicker.cls.fullClass, '')}
              onRemove={() => { handleStage(chipColorPicker.cls.property, chipColorPicker.cls.fullClass, ''); setChipColorPicker(null); }}
            />
          </div>
        </FloatingPortal>
      )}

            {/* ── Property Sections — always rendered for every section ─── */}
      {ALL_SECTIONS.map((section) => {
        const rawClasses = groups.get(section) || [];
        // Filter out classes consumed by composite components (BoxModel, GradientEditor)
        const classes = rawClasses.filter(c => !isCompositeConsumed(c));
        const addableProps = (ADDABLE_PROPERTIES_MAP as Record<string, typeof ADDABLE_PROPERTIES_MAP[Category]>)[section] || [];

        // ── Flex-parent detection ──────────────────────────────────────────────────
        // "Parent-type" flex property keys: present on any element that is a flex container
        const FLEX_PARENT_KEYS = new Set(['flex-display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap']);
        const isFlexParent = section === 'flexbox' && parsedClasses.some(c => {
          const g = ENUM_GROUPS[c.fullClass];
          return g && FLEX_PARENT_KEYS.has(g.propertyKey ?? '');
        });

        // When showing dedicated flex-parent controls, hide those properties from the [+] menu
        const FLEX_PARENT_PREFIXES = new Set(['flex', 'flex-row', 'flex-wrap', 'justify-start', 'items-start']);
        const filteredAddableProps = isFlexParent
          ? addableProps.filter(p => !FLEX_PARENT_PREFIXES.has(p.prefix.replace(/-$/, '')))
          : addableProps;

        const available = filterAvailable(filteredAddableProps, classes, pendingPrefixes, stagedPendingPrefixes);
        const sectionPendingPrefixes = addableProps
          .filter(p => pendingPrefixes.has(p.prefix))
          .map(p => p.prefix);
        const sectionStagedPrefixes = addableProps
          .filter(p => stagedPendingPrefixes.has(p.prefix.replace(/-$/g, '')))
          .map(p => p.prefix);

        const isEmpty = section === 'color'
          ? false  // GradientEditor always renders
          : section === 'flexbox' && isFlexParent
          ? false  // flex parent controls always render when isFlexParent
          : section === 'borders'
          ? false  // CornerModel always renders
          : classes.length === 0 && sectionPendingPrefixes.length === 0 && sectionStagedPrefixes.length === 0;

        const classCount = section === 'borders'
          ? cornerModelStateFromClasses(parsedClasses).slots.filter(s => s.value != null).length
            + (cornerModelStateFromClasses(parsedClasses).shorthandValue ? 1 : 0)
          : classes.length + sectionPendingPrefixes.length + sectionStagedPrefixes.length;

        return (
          <PropertySection
            key={section}
            label={SECTION_LABELS[section] ?? section}
            availableProperties={available}
            onAddProperty={handleAddProperty}
            isEmpty={isEmpty}
            classCount={classCount}
          >
            {/* Composite: CornerModel handles radius in 'borders' section */}
            {section === 'borders' && (
              <CornerModel
                state={applyCornerOverrides(cornerModelStateFromClasses(parsedClasses))}
                onSlotHover={(_key, value) => {
                  const state = cornerModelStateFromClasses(parsedClasses);
                  const slotValue = _key === 'all'
                    ? (cornerOverrides.get('all') ?? state.shorthandValue)
                    : (cornerOverrides.get(_key) ?? state.slots.find(s => s.key === _key)?.value ?? null);
                  const current = slotValue ?? '';
                  if (value === null) patchManager.revertPreview();
                  else patchManager.preview(current, value);
                }}
                onSlotChange={(_key, value) => {
                  const state = cornerModelStateFromClasses(parsedClasses);
                  const current = cornerOverrides.get(_key)
                    ?? (_key === 'all' ? state.shorthandValue : state.slots.find(s => s.key === _key)?.value)
                    ?? '';
                  handleStage(`rounded-${_key}`, current, value);
                  setCornerOverrides(prev => new Map(prev).set(_key, value));
                }}
                onSlotRemove={(_key) => {
                  const current = cornerOverrides.get(_key)
                    ?? cornerModelStateFromClasses(parsedClasses).slots.find(s => s.key === _key)?.value
                    ?? '';
                  if (current) {
                    handleStage(`rounded-${_key}`, current, '');
                    setCornerOverrides(prev => new Map(prev).set(_key, null));
                  }
                }}
                onSlotRemoveHover={(_key) => {
                  const current = cornerOverrides.get(_key)
                    ?? cornerModelStateFromClasses(parsedClasses).slots.find(s => s.key === _key)?.value
                    ?? '';
                  if (current) patchManager.preview(current, '');
                }}
                onEditStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
              />
            )}

            {/* Composite: GradientEditor handles 'color' section */}
            {section === 'color' && (
              <GradientEditor
                {...parsedClassesToGradientEditorProps(
                  parsedClasses,
                  tailwindConfig?.colors || {},
                  stagedPatches.filter(p => p.elementKey === elementKey)
                )}
                onPreview={handlePreview}
                onPreviewBatch={(pairs) => patchManager.previewBatch(pairs)}
                onRevert={handleRevert}
                onStage={handleGradientStage}
              />
            )}

            {/* Composite: Flex-parent controls — show all when element is a flex container */}
            {section === 'flexbox' && isFlexParent && (() => {
              const allFlexClasses = parsedClasses;
              const flexDisplayToken = allFlexClasses.find(c => { const g = ENUM_GROUPS[c.fullClass]; return g?.propertyKey === 'flex-display'; });
              const flexDirToken    = allFlexClasses.find(c => { const g = ENUM_GROUPS[c.fullClass]; return g?.propertyKey === 'flex-direction'; });
              const justifyToken    = allFlexClasses.find(c => { const g = ENUM_GROUPS[c.fullClass]; return g?.propertyKey === 'justify-content'; });
              const alignToken      = allFlexClasses.find(c => { const g = ENUM_GROUPS[c.fullClass]; return g?.propertyKey === 'align-items'; });
              const wrapToken       = allFlexClasses.find(c => { const g = ENUM_GROUPS[c.fullClass]; return g?.propertyKey === 'flex-wrap'; });

              const DIR_TO_CSS: Record<FlexDirectionValue, 'row' | 'column' | 'row-reverse' | 'column-reverse'> = {
                'flex-row':         'row',
                'flex-col':         'column',
                'flex-row-reverse': 'row-reverse',
                'flex-col-reverse': 'column-reverse',
              };
              const currentDir = (flexDirToken?.fullClass ?? null) as FlexDirectionValue | null;
              const cssFd = currentDir ? (DIR_TO_CSS[currentDir] ?? 'row') : 'row';

              const flexDir  = resolvePropertyState('flex-direction', flexDirToken);
              const flexWrap = resolvePropertyState('flex-wrap', wrapToken);
              const justify  = resolvePropertyState('justify-content', justifyToken);
              const align    = resolvePropertyState('align-items', alignToken);

              return (
                <div className="flex flex-wrap gap-1">
                  <FlexDirection
                    value={currentDir}
                    lockedValue={flexDir.effectiveClass !== flexDir.originalClass ? flexDir.effectiveClass : null}
                    locked={false}
                    onHover={(v) => handlePreview(flexDir.effectiveClass, v)}
                    onLeave={handleRevert}
                    onClick={(v) => handleStage('flex-direction', flexDir.originalClass, v)}
                  />
                  <FlexWrap
                    value={(wrapToken?.fullClass ?? null) as FlexWrapValue | null}
                    lockedValue={flexWrap.effectiveClass !== flexWrap.originalClass ? flexWrap.effectiveClass : null}
                    locked={false}
                    onHover={(v) => handlePreview(flexWrap.effectiveClass, v)}
                    onLeave={handleRevert}
                    onClick={(v) => handleStage('flex-wrap', flexWrap.originalClass, v)}
                  />
                  <FlexJustify
                    currentValue={justifyToken?.fullClass ?? null}
                    lockedValue={justify.effectiveClass !== justify.originalClass ? justify.effectiveClass : null}
                    locked={false}
                    flexDirection={cssFd}
                    onHover={(v) => handlePreview(justify.effectiveClass, v)}
                    onLeave={handleRevert}
                    onClick={(v) => handleStage('justify-content', justify.originalClass, v)}
                    onRemove={justify.hasValue ? () => handleStage('justify-content', justify.originalClass, '') : undefined}
                    onRemoveHover={justify.hasValue ? () => handlePreview(justify.effectiveClass, '') : undefined}
                  />
                  <FlexAlign
                    currentValue={alignToken?.fullClass ?? null}
                    lockedValue={align.effectiveClass !== align.originalClass ? align.effectiveClass : null}
                    locked={false}
                    flexDirection={cssFd}
                    onHover={(v) => handlePreview(align.effectiveClass, v)}
                    onLeave={handleRevert}
                    onClick={(v) => handleStage('align-items', align.originalClass, v)}
                    onRemove={align.hasValue ? () => handleStage('align-items', align.originalClass, '') : undefined}
                    onRemoveHover={align.hasValue ? () => handlePreview(align.effectiveClass, '') : undefined}
                  />
                </div>
              );
            })()}

            {/* Existing classes on the element */}
            {classes.map((cls) => {
              // Skip flex-parent classes when dedicated controls are shown above
              if (isFlexParent) {
                const grp = ENUM_GROUPS[cls.fullClass];
                if (grp && FLEX_PARENT_KEYS.has(grp.propertyKey ?? '')) return null;
              }

              if (cls.scaleName !== undefined) {
                const scaleValues = getScaleValues(tokenClassPrefix(cls), cls.scaleName, tailwindConfig);
                if (scaleValues.length > 0) {
                  const stagedValue = stagedPatches.find(p => p.property === cls.property)?.newClass ?? null;
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
                      onClick={(newClass) => handleStage(cls.property, cls.fullClass, newClass)}
                      onRemoveHover={() => patchManager.preview(cls.fullClass, '')}
                      onRemove={() => handleStage(cls.property, cls.fullClass, '')}
                    />
                  );
                }
              }
              if (cls.scaleName === undefined && cls.color === undefined) {
                const group = ENUM_GROUPS[cls.fullClass];
                if (group) {
                  const stagedValue = stagedPatches.find(p => p.property === group.propertyKey)?.newClass ?? null;
                  return (
                    <ScaleScrubber
                      key={cls.fullClass}
                      values={group.alternatives}
                      currentValue={cls.fullClass}
                      lockedValue={stagedValue}
                      locked={false}
                      onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                      onHover={(newClass) => handleScrubberPreview(cls, newClass)}
                      onLeave={() => handleScrubberRevert(cls)}
                      onClick={(newClass) => handleStage(group.propertyKey, cls.fullClass, newClass)}
                      onRemoveHover={() => patchManager.preview(cls.fullClass, '')}
                      onRemove={() => handleStage(group.propertyKey, cls.fullClass, '')}
                    />
                  );
                }
              }
              return (
                <div
                  key={cls.fullClass}
                  className={`group flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border transition-colors ${
                    (selectedClass?.fullClass === cls.fullClass || chipColorPicker?.cls.fullClass === cls.fullClass)
                      ? 'border-bv-border bg-bv-surface-hi text-bv-text'
                      : 'bg-bv-surface text-bv-text-mid border-transparent hover:border-bv-teal hover:text-bv-teal'
                  }`}
                  onClick={(e) => handleChipClick(cls, e.currentTarget)}
                >
                  {cls.fullClass}
                  <span
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-0.5 shrink-0"
                    title="Remove class"
                    onClick={(e) => { e.stopPropagation(); handleStage(cls.property, cls.fullClass, ''); }}
                    onMouseEnter={(e) => { e.stopPropagation(); patchManager.preview(cls.fullClass, ''); }}
                    onMouseLeave={(e) => { e.stopPropagation(); patchManager.revertPreview(); }}
                  >
                    <svg viewBox="0 0 10 10" width="8" height="8" xmlns="http://www.w3.org/2000/svg">
                      <line x1="1" y1="1" x2="9" y2="9" stroke="#F5532D" strokeWidth="1.8" strokeLinecap="round" />
                      <line x1="9" y1="1" x2="1" y2="9" stroke="#F5532D" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </div>
              );
            })}

            {/* Staged pending values (from + button, user picked a value) */}
            {sectionStagedPrefixes.map(prefix => {
              const config = getPendingConfig(prefix);
              if (!config) return null;
              if (config.valueType === 'scalar') {
                const scaleValues = getScaleValues(prefix, config.scaleName, tailwindConfig);
                if (scaleValues.length === 0) return null;
                const patch = stagedPatches.find(pt => pt.property === config.stagingKey);
                return (
                  <ScaleScrubber
                    key={`staged-${prefix}`}
                    values={scaleValues}
                    currentValue={patch?.newClass ?? scaleValues[Math.floor(scaleValues.length / 2)]}
                    lockedValue={patch?.newClass ?? null}
                    locked={false}
                    onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                    onHover={(newClass) => handlePendingPreview(prefix, newClass)}
                    onLeave={() => handlePendingRevert(prefix)}
                    onClick={(newClass) => handlePendingStage(prefix, newClass)}
                  />
                );
              }
              if (config.valueType === 'enum' && config.enumAlts) {
                const patch = stagedPatches.find(pt => pt.property === config.stagingKey);
                return (
                  <ScaleScrubber
                    key={`staged-${prefix}`}
                    values={config.enumAlts}
                    currentValue={patch?.newClass ?? config.enumAlts[0]}
                    lockedValue={patch?.newClass ?? null}
                    locked={false}
                    onStart={() => sendTo('overlay', { type: 'CLEAR_HIGHLIGHTS' })}
                    onHover={(newClass) => handlePendingPreview(prefix, newClass)}
                    onLeave={() => handlePendingRevert(prefix)}
                    onClick={(newClass) => handlePendingStage(prefix, newClass)}
                  />
                );
              }
              return null;
            })}

            {/* Pending ghost scrubbers from + button (not yet staged) */}
            {sectionPendingPrefixes.map(prefix => {
              const config = getPendingConfig(prefix);
              if (!config) return null;
              if (config.valueType === 'scalar') {
                const scaleValues = getScaleValues(prefix, config.scaleName, tailwindConfig);
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
              if (config.valueType === 'enum' && config.enumAlts) {
                return (
                  <ScaleScrubber
                    key={`pending-${prefix}`}
                    values={config.enumAlts}
                    currentValue={config.enumAlts[0]}
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
              if (config.valueType === 'color') {
                return (
                  <div
                    key={`pending-${prefix}`}
                    data-testid={`pending-ghost-${prefix}`}
                    className="px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border border-dashed border-bv-border text-bv-muted hover:border-bv-teal hover:text-bv-teal transition-colors"
                    onClick={(e) => {
                      const ghostToken: ParsedToken = {
                        property: 'text',
                        fullClass: '',
                        section: 'typography',
                        color: '',
                      };
                      setChipColorPicker({ cls: ghostToken, anchorEl: e.currentTarget });
                      setSelectedClass(null);
                    }}
                  >
                    {prefix === 'text-color' ? 'text-' : prefix}color
                  </div>
                );
              }
              return null;
            })}
          </PropertySection>
        );
      })}
    </div>
  );
}
