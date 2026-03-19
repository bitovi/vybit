import {
	autoUpdate,
	FloatingPortal,
	flip,
	offset,
	shift,
	size,
	useDismiss,
	useFloating,
	useInteractions,
} from "@floating-ui/react";
import { useEffect, useRef, useState } from "react";
import type { ParsedClass } from "../../overlay/src/class-parser";
import {
	buildAddablePropertiesFromRules,
	buildEnumGroupsFromRules,
	type Category,
	getCompositeConsumingPrefixes,
	PROPERTY_RULES,
} from "../../overlay/src/propertyRules";
import { BoxModel } from "./components/BoxModel";
import { boxModelLayersFromClasses } from "./components/BoxModel/layerUtils";
import type {
	LayerName,
	LayerState,
	SlotKey,
} from "./components/BoxModel/types";
import { ColorGrid } from "./components/ColorGrid";
import {
	GradientEditor,
	parsedClassesToGradientEditorProps,
} from "./components/GradientEditor";
import { getScaleValues } from "./components/getScaleValues";
import { PropertySection } from "./components/PropertySection";
import type { AvailableProperty } from "./components/PropertySection/types";
import { ScaleScrubber } from "./components/ScaleScrubber";
import type { PatchManager } from "./hooks/usePatchManager";
import { sendTo } from "./ws";

const CATEGORY_LABELS: Record<Category, string> = {
	spacing: "Spacing",
	sizing: "Sizing",
	typography: "Typography",
	color: "Backgrounds",
	borders: "Borders",
	effects: "Effects",
	layout: "Layout",
	flexbox: "Flexbox & Grid",
	gradient: "Gradient",
};

/**
 * Ordered list of all categories to render as sections (gradient excluded — it renders inside 'color').
 * Categories always render, even when empty, so users can always add via [+].
 */
const ALL_CATEGORIES: Category[] = [
	"sizing",
	"typography",
	"color",
	"flexbox",
	"borders",
	"effects",
	"layout",
];

/** Prefixes & exact classes consumed by composite components (BoxModel, GradientEditor). */
const COMPOSITE_CONSUMING_PREFIXES = getCompositeConsumingPrefixes();

/** Maps each class token → its enum alternatives + staging property key. Built from propertyRules. */
const ENUM_GROUPS = buildEnumGroupsFromRules();

/** Per-category [+] menu entries, generated from propertyRules addable entries. */
const ADDABLE_PROPERTIES_MAP = buildAddablePropertiesFromRules();

/**
 * Typography properties that need virtual prefixes (text- is ambiguous: font-size vs color vs align).
 * These are the only special cases not auto-generated from PROPERTY_RULES.
 */
const TYPOGRAPHY_ADDABLE_SPECIALS: Record<
	string,
	{
		themeKey: string | null;
		valueType: "scalar" | "color" | "enum";
		enumAlts?: string[];
	}
> = {
	"text-size": { themeKey: "fontSize", valueType: "scalar" },
	"text-color": { themeKey: "colors", valueType: "color" },
};

/** Augment the typography section with the virtual specials not in PROPERTY_RULES. */
ADDABLE_PROPERTIES_MAP.typography.unshift(
	{ name: "Font size", prefixHint: "text-sm/base/lg/…", prefix: "text-size" },
	{ name: "Text color", prefixHint: "text-{color}", prefix: "text-color" },
);

/** Look up pending/staging config for a prefix. Covers PROPERTY_RULES entries and typography specials. */
function getPendingConfig(
	prefix: string,
): {
	themeKey: string | null;
	valueType: "scalar" | "color" | "enum";
	enumAlts?: string[];
	stagingKey: string;
} | null {
	// Typography specials (virtual prefixes)
	const special = TYPOGRAPHY_ADDABLE_SPECIALS[prefix];
	if (special) return { ...special, stagingKey: prefix };

	// PROPERTY_RULES lookup by propertyKey (find the canonical entry that has this propertyKey)
	const ruleEntry = Object.entries(PROPERTY_RULES).find(
		([key, r]) =>
			(r.propertyKey ?? key.replace(/-$/g, "")) === prefix && r.addable,
	);
	if (ruleEntry) {
		const [key, rule] = ruleEntry;
		return {
			themeKey: rule.themeKey,
			valueType: rule.valueType,
			enumAlts: rule.enumAlts,
			stagingKey: prefix,
		};
	}

	// Direct PROPERTY_RULES lookup (for scalar prefixes like 'w-', 'h-', 'font-', etc.)
	const directRule = PROPERTY_RULES[prefix];
	if (directRule) {
		return {
			themeKey: directRule.themeKey,
			valueType: directRule.valueType,
			enumAlts: directRule.enumAlts,
			stagingKey: prefix.replace(/-$/g, ""),
		};
	}

	return null;
}

/** Filter available [+] properties to only those not already present, pending, or staged. */
function filterAvailable(
	available: AvailableProperty[],
	classes: ParsedClass[],
	pending: Set<string>,
	staged?: Set<string>,
): AvailableProperty[] {
	const usedFullClasses = new Set(classes.map((c) => c.fullClass));
	const usedPrefixes = new Set(classes.map((c) => c.prefix));
	return available.filter((p) => {
		if (pending.has(p.prefix)) return false;
		if (staged?.has(p.prefix)) return false;
		const config = getPendingConfig(p.prefix);
		if (config?.valueType === "enum" && config.enumAlts) {
			return !config.enumAlts.some((alt) => usedFullClasses.has(alt));
		}
		// For scalars/colors, check if the prefix is already used
		if (config && config.valueType !== "enum") {
			// text-size and text-color share the 'text-' prefix — check themeKey too
			if (p.prefix === "text-size")
				return !classes.some(
					(c) => c.prefix === "text-" && c.themeKey === "fontSize",
				);
			if (p.prefix === "text-color")
				return !classes.some(
					(c) => c.prefix === "text-" && c.themeKey === "colors",
				);
		}
		return !usedPrefixes.has(p.prefix);
	});
}

function groupByCategory(classes: ParsedClass[]): Map<Category, ParsedClass[]> {
	const groups = new Map<Category, ParsedClass[]>();
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

export function Picker({
	componentName,
	instanceCount,
	parsedClasses,
	tailwindConfig,
	patchManager,
}: PickerProps) {
	const [selectedClass, setSelectedClass] = useState<ParsedClass | null>(null);
	// Local overrides for BoxModel slots staged this session (key: "layer-slotKey" → fullClass)
	const [boxModelOverrides, setBoxModelOverrides] = useState<
		Map<string, string>
	>(new Map());
	// Active color picker for a box model color slot
	const [boxModelColorPicker, setBoxModelColorPicker] = useState<{
		layer: LayerName;
		prefix: string;
		currentClass: string;
		staged: boolean;
		anchorEl: Element;
	} | null>(null);
	// Active color picker for a property chip (Backgrounds, etc.)
	const [chipColorPicker, setChipColorPicker] = useState<{
		cls: ParsedClass;
		anchorEl: Element;
	} | null>(null);
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
	const classesKeyRef = useRef(parsedClasses.map((c) => c.fullClass).join(" "));
	const currentClassesKey = parsedClasses.map((c) => c.fullClass).join(" ");
	useEffect(() => {
		if (classesKeyRef.current !== currentClassesKey) {
			classesKeyRef.current = currentClassesKey;
			patchManager.revertPreview();
			setBoxModelOverrides(new Map());
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

	function applyBoxModelOverrides(layers: LayerState[]): LayerState[] {
		if (boxModelOverrides.size === 0) return layers;
		return layers.map((layer) => {
			const shorthandOverride = boxModelOverrides.get(
				`${layer.layer}-shorthand`,
			);
			const updatedSlots = layer.slots.map((slot) => {
				const override = boxModelOverrides.get(`${layer.layer}-${slot.key}`);
				return override !== undefined ? { ...slot, value: override } : slot;
			});
			const newShorthandValue = shorthandOverride ?? layer.shorthandValue;
			let classState = layer.classState;
			if (shorthandOverride !== undefined) {
				const hasSlotValues = updatedSlots.some((s) => s.value != null);
				classState = hasSlotValues ? "mixed" : "shorthand";
			}
			return {
				...layer,
				shorthandValue: newShorthandValue,
				classState,
				slots: updatedSlots,
			};
		});
	}

	const groups = groupByCategory(parsedClasses);

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

	function handleChipClick(cls: ParsedClass, anchorEl?: Element) {
		patchManager.revertPreview();
		sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" });
		if (cls.valueType === "color" && anchorEl) {
			setChipColorPicker((prev) =>
				prev?.cls.fullClass === cls.fullClass ? null : { cls, anchorEl },
			);
			setSelectedClass(null);
		} else {
			setChipColorPicker(null);
			setSelectedClass(cls);
		}
	}

	function handleScrubberPreview(cls: ParsedClass, newClass: string) {
		patchManager.preview(cls.fullClass, newClass);
	}

	function handleScrubberRevert(_cls: ParsedClass) {
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
					<div
						ref={chipColorPickerRefs.setFloating}
						style={{
							...chipColorPickerStyles,
							zIndex: 9999,
							overflowY: "auto",
						}}
						{...getChipColorPickerFloatingProps()}
					>
						<ColorGrid
							prefix={chipColorPicker.cls.prefix}
							currentValue={chipColorPicker.cls.value}
							colors={tailwindConfig?.colors || {}}
							locked={false}
							lockedValue={
								stagedPatches.find(
									(p) => p.property === chipColorPicker.cls.prefix,
								)?.newClass ?? null
							}
							onHover={(fullClass) =>
								handlePreview(chipColorPicker.cls.fullClass, fullClass)
							}
							onLeave={handleRevert}
							onClick={(fullClass) =>
								handleStage(
									chipColorPicker.cls.prefix,
									chipColorPicker.cls.fullClass,
									fullClass,
								)
							}
							onRemoveHover={() =>
								handlePreview(chipColorPicker.cls.fullClass, "")
							}
							onRemove={() => {
								handleStage(
									chipColorPicker.cls.prefix,
									chipColorPicker.cls.fullClass,
									"",
								);
								setChipColorPicker(null);
							}}
						/>
					</div>
				</FloatingPortal>
			)}

			{/* ── Property Sections — always rendered for every category ─── */}
			{ALL_CATEGORIES.map((category) => {
				const rawClasses = groups.get(category) || [];
				// Filter out classes consumed by composite components (BoxModel, GradientEditor)
				const classes = rawClasses.filter(
					(c) =>
						!COMPOSITE_CONSUMING_PREFIXES.has(c.prefix) &&
						!COMPOSITE_CONSUMING_PREFIXES.has(c.fullClass),
				);
				const addableProps = ADDABLE_PROPERTIES_MAP[category] || [];
				const available = filterAvailable(
					addableProps,
					classes,
					pendingPrefixes,
					stagedPendingPrefixes,
				);
				const sectionPendingPrefixes = addableProps
					.filter((p) => pendingPrefixes.has(p.prefix))
					.map((p) => p.prefix);
				const sectionStagedPrefixes = addableProps
					.filter((p) => stagedPendingPrefixes.has(p.prefix))
					.map((p) => p.prefix);

				const isEmpty =
					category === "color"
						? false // GradientEditor always renders
						: classes.length === 0 &&
							sectionPendingPrefixes.length === 0 &&
							sectionStagedPrefixes.length === 0;

				return (
					<PropertySection
						key={category}
						label={CATEGORY_LABELS[category]}
						availableProperties={available}
						onAddProperty={handleAddProperty}
						isEmpty={isEmpty}
					>
						{/* Composite: GradientEditor handles 'color' category */}
						{category === "color" && (
							<GradientEditor
								{...parsedClassesToGradientEditorProps(
									parsedClasses,
									tailwindConfig?.colors || {},
									stagedPatches.filter((p) => p.elementKey === elementKey),
								)}
								onPreview={handlePreview}
								onPreviewBatch={(pairs) => patchManager.previewBatch(pairs)}
								onRevert={handleRevert}
								onStage={handleGradientStage}
							/>
						)}

						{/* Existing classes on the element */}
						{classes.map((cls) => {
							if (cls.valueType === "scalar") {
								const scaleValues = getScaleValues(
									cls.prefix,
									cls.themeKey,
									tailwindConfig,
								);
								if (scaleValues.length > 0) {
									const stagedValue =
										stagedPatches.find((p) => p.property === cls.prefix)
											?.newClass ?? null;
									return (
										<ScaleScrubber
											key={cls.fullClass}
											values={scaleValues}
											currentValue={cls.fullClass}
											lockedValue={stagedValue}
											locked={false}
											onStart={() =>
												sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
											}
											onHover={(newClass) =>
												handleScrubberPreview(cls, newClass)
											}
											onLeave={() => handleScrubberRevert(cls)}
											onClick={(newClass) =>
												handleStage(cls.prefix, cls.fullClass, newClass)
											}
											onRemoveHover={() =>
												patchManager.preview(cls.fullClass, "")
											}
											onRemove={() =>
												handleStage(cls.prefix, cls.fullClass, "")
											}
										/>
									);
								}
							}
							if (cls.valueType === "enum") {
								const group = ENUM_GROUPS[cls.fullClass];
								if (group) {
									const stagedValue =
										stagedPatches.find((p) => p.property === group.propertyKey)
											?.newClass ?? null;
									return (
										<ScaleScrubber
											key={cls.fullClass}
											values={group.alternatives}
											currentValue={cls.fullClass}
											lockedValue={stagedValue}
											locked={false}
											onStart={() =>
												sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
											}
											onHover={(newClass) =>
												handleScrubberPreview(cls, newClass)
											}
											onLeave={() => handleScrubberRevert(cls)}
											onClick={(newClass) =>
												handleStage(group.propertyKey, cls.fullClass, newClass)
											}
											onRemoveHover={() =>
												patchManager.preview(cls.fullClass, "")
											}
											onRemove={() =>
												handleStage(group.propertyKey, cls.fullClass, "")
											}
										/>
									);
								}
							}
							return (
								<div
									key={cls.fullClass}
									className={`group inline-flex items-center px-2 py-0.5 rounded-md cursor-pointer text-[11px] font-mono transition-colors ${
										selectedClass?.fullClass === cls.fullClass ||
										chipColorPicker?.cls.fullClass === cls.fullClass
											? "bg-bv-surface-hi text-bv-text ring-1 ring-bv-border"
											: "bg-bv-surface text-bv-text-mid hover:bg-bv-surface-hi hover:text-bv-text"
									}`}
									onClick={(e) => handleChipClick(cls, e.currentTarget)}
								>
									{cls.fullClass}
									<span
										className="inline-flex items-center justify-center w-0 group-hover:w-3.5 h-3.5 rounded-full overflow-hidden opacity-0 group-hover:opacity-50 hover:opacity-100! ml-0 group-hover:ml-1 transition-all text-bv-text-mid hover:text-red-400 shrink-0"
										title="Remove class"
										onClick={(e) => {
											e.stopPropagation();
											handleStage(cls.prefix, cls.fullClass, "");
										}}
										onMouseEnter={(e) => {
											e.stopPropagation();
											patchManager.preview(cls.fullClass, "");
										}}
										onMouseLeave={(e) => {
											e.stopPropagation();
											patchManager.revertPreview();
										}}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
											<circle cx="6" cy="6" r="5.5" />
											<line x1="4" y1="4" x2="8" y2="8" />
											<line x1="8" y1="4" x2="4" y2="8" />
										</svg>
									</span>
								</div>
							);
						})}

						{/* Staged pending values (from + button, user picked a value) */}
						{sectionStagedPrefixes.map((prefix) => {
							const config = getPendingConfig(prefix);
							if (!config) return null;
							if (config.valueType === "scalar") {
								const scaleValues = getScaleValues(
									prefix,
									config.themeKey,
									tailwindConfig,
								);
								if (scaleValues.length === 0) return null;
								const patch = stagedPatches.find(
									(pt) => pt.property === config.stagingKey,
								);
								return (
									<ScaleScrubber
										key={`staged-${prefix}`}
										values={scaleValues}
										currentValue={
											patch?.newClass ??
											scaleValues[Math.floor(scaleValues.length / 2)]
										}
										lockedValue={patch?.newClass ?? null}
										locked={false}
										onStart={() =>
											sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
										}
										onHover={(newClass) =>
											handlePendingPreview(prefix, newClass)
										}
										onLeave={() => handlePendingRevert(prefix)}
										onClick={(newClass) => handlePendingStage(prefix, newClass)}
									/>
								);
							}
							if (config.valueType === "enum" && config.enumAlts) {
								const patch = stagedPatches.find(
									(pt) => pt.property === config.stagingKey,
								);
								return (
									<ScaleScrubber
										key={`staged-${prefix}`}
										values={config.enumAlts}
										currentValue={patch?.newClass ?? config.enumAlts[0]}
										lockedValue={patch?.newClass ?? null}
										locked={false}
										onStart={() =>
											sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
										}
										onHover={(newClass) =>
											handlePendingPreview(prefix, newClass)
										}
										onLeave={() => handlePendingRevert(prefix)}
										onClick={(newClass) => handlePendingStage(prefix, newClass)}
									/>
								);
							}
							return null;
						})}

						{/* Pending ghost scrubbers from + button (not yet staged) */}
						{sectionPendingPrefixes.map((prefix) => {
							const config = getPendingConfig(prefix);
							if (!config) return null;
							if (config.valueType === "scalar") {
								const scaleValues = getScaleValues(
									prefix,
									config.themeKey,
									tailwindConfig,
								);
								if (scaleValues.length > 0) {
									return (
										<ScaleScrubber
											key={`pending-${prefix}`}
											values={scaleValues}
											currentValue={
												scaleValues[Math.floor(scaleValues.length / 2)]
											}
											lockedValue={null}
											locked={false}
											ghost
											onStart={() =>
												sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
											}
											onHover={(newClass) =>
												handlePendingPreview(prefix, newClass)
											}
											onLeave={() => handlePendingRevert(prefix)}
											onClick={(newClass) =>
												handlePendingStage(prefix, newClass)
											}
										/>
									);
								}
							}
							if (config.valueType === "enum" && config.enumAlts) {
								return (
									<ScaleScrubber
										key={`pending-${prefix}`}
										values={config.enumAlts}
										currentValue={config.enumAlts[0]}
										lockedValue={null}
										locked={false}
										ghost
										onStart={() =>
											sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
										}
										onHover={(newClass) =>
											handlePendingPreview(prefix, newClass)
										}
										onLeave={() => handlePendingRevert(prefix)}
										onClick={(newClass) => handlePendingStage(prefix, newClass)}
									/>
								);
							}
							if (config.valueType === "color") {
								return (
									<div
										key={`pending-${prefix}`}
										data-testid={`pending-ghost-${prefix}`}
										className="px-2 py-0.5 rounded-md cursor-pointer text-[11px] font-mono border border-dashed border-bv-border text-bv-muted hover:border-bv-teal hover:text-bv-teal transition-colors"
										onClick={(e) => {
											const ghostCls: ParsedClass = {
												category: "typography",
												valueType: "color",
												prefix: "text-",
												value: "",
												fullClass: "",
												themeKey: "colors",
											};
											setChipColorPicker({
												cls: ghostCls,
												anchorEl: e.currentTarget,
											});
											setSelectedClass(null);
										}}
									>
										{prefix === "text-color" ? "text-" : prefix}color
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
