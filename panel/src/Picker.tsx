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
import type { ParsedToken } from "../../overlay/src/tailwind/grammar";
import {
	buildAddablePropertiesFromRules,
	buildEnumGroupsFromRules,
	type Category,
	CONTROL_GROUP_PROPERTY_KEYS,
	CONTROL_GROUP_RULE_KEYS,
	PROPERTY_RULES,
} from "../../overlay/src/tailwind/propertyRules";
import {
	cornerScale,
	INSET_SHADOW_SIZE_SET,
	RADIUS_SCALE,
	RING_WIDTH_SET,
	SHADOW_SIZE_SET,
	TEXT_SHADOW_SIZE_SET,
} from "../../overlay/src/tailwind/scales";
import { ColorGrid } from "./components/ColorGrid";
import type {
	CornerModelState,
	SlotKey as CornerSlotKey,
} from "./components/CornerModel";
import { CornerModel } from "./components/CornerModel";
import { FlexAlignSelect } from "./components/FlexAlignSelect";
import { FlexDirectionSelect } from "./components/FlexDirectionSelect";
import { FlexJustifySelect } from "./components/FlexJustifySelect";
import { FlexWrapSelect } from "./components/FlexWrapSelect";
import { GapModel } from "./components/GapModel";
import type { GapSlotData } from "./components/GapModel/types";
import {
	GradientEditor,
	parsedClassesToGradientEditorProps,
} from "./components/GradientEditor";
import { getScaleValues } from "./components/getScaleValues";
import { PropertySection } from "./components/PropertySection";
import type { AvailableProperty } from "./components/PropertySection/types";
import { ScaleScrubber } from "./components/ScaleScrubber";
import { ShadowEditor } from "./components/ShadowEditor";
import {
	computeEffectiveShadowClasses,
	parsedClassesToShadowLayers,
	SHADOW_TYPE_CONFIGS,
} from "./components/ShadowEditor/shadowUtils";
import type { ShadowLayerState } from "./components/ShadowEditor/types";
import type { PatchManager } from "./hooks/usePatchManager";
import { sendTo } from "./ws";

const SECTION_LABELS: Record<string, string> = {
	margin: "Margin",
	padding: "Padding",
	sizing: "Sizing",
	typography: "Typography",
	color: "Backgrounds",
	borders: "Borders",
	effects: "Effects",
	layout: "Layout",
	flexbox: "Flexbox & Grid",
	overflow: "Overflow",
};

/**
 * Ordered list of sections to render.
 * Spatial sections first, then visual sections.
 */
const ALL_SECTIONS = [
	"layout",
	"margin",
	"padding",
	"sizing",
	"flexbox",
	"borders",
	"typography",
	"color",
	"shadows",
	"effects",
];

/** Derives the class prefix string for building new class names (e.g. 'py-2' → 'py-'). */
function tokenClassPrefix(t: ParsedToken): string {
	const val = t.scale ?? t.color ?? t.style ?? t.align ?? t.size ?? t.value;
	if (val) return t.fullClass.slice(0, t.fullClass.length - val.length);
	return t.property + "-";
}

/** Returns true for tokens consumed by CornerModel, GradientEditor, or ShadowEditor (not rendered as chips). */
function isCompositeConsumed(t: ParsedToken): boolean {
	if (t.property === "rounded") return true; // consumed by CornerModel
	if (
		t.property === "bg" ||
		t.property === "bg-gradient-to" ||
		t.property === "from" ||
		t.property === "via" ||
		t.property === "to"
	)
		return true;
	if (t.property === "shadow") return true; // consumed by ShadowEditor
	if (t.property === "text-shadow") return true; // consumed by ShadowEditor
	return false;
}

/** Builds CornerModelState from the current parsedClasses */
function cornerModelStateFromClasses(classes: ParsedToken[]): CornerModelState {
	const rounded = classes.filter((c) => c.property === "rounded");

	// Map fullClass → slot key
	const PREFIXES: { prefix: RegExp; key: CornerSlotKey }[] = [
		{ prefix: /^rounded-tl(-|$)/, key: "tl" },
		{ prefix: /^rounded-tr(-|$)/, key: "tr" },
		{ prefix: /^rounded-br(-|$)/, key: "br" },
		{ prefix: /^rounded-bl(-|$)/, key: "bl" },
		{ prefix: /^rounded-t(-|$)/, key: "t" },
		{ prefix: /^rounded-r(-|$)/, key: "r" },
		{ prefix: /^rounded-b(-|$)/, key: "b" },
		{ prefix: /^rounded-l(-|$)/, key: "l" },
	];

	const slotValues = new Map<CornerSlotKey, string>();
	let shorthandValue: string | null = null;

	for (const cls of rounded) {
		const fc = cls.fullClass;
		const match = PREFIXES.find((p) => p.prefix.test(fc));
		if (match) {
			slotValues.set(match.key, fc);
		} else {
			// bare rounded or rounded-{size} with no side/corner → shorthand
			shorthandValue = fc;
		}
	}

	const allKeys: CornerSlotKey[] = [
		"all",
		"t",
		"r",
		"b",
		"l",
		"tl",
		"tr",
		"br",
		"bl",
	];
	return {
		shorthandValue,
		shorthandScaleValues: RADIUS_SCALE,
		slots: allKeys.map((key) => ({
			key,
			value: key === "all" ? shorthandValue : (slotValues.get(key) ?? null),
			placeholder: key,
			scaleValues: key === "all" ? RADIUS_SCALE : cornerScale(`rounded-${key}`),
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
const TYPOGRAPHY_ADDABLE_SPECIALS: Record<
	string,
	{
		scaleName: string | null;
		valueType: "scalar" | "color" | "enum";
		enumAlts?: string[];
	}
> = {
	"text-size": { scaleName: "fontSize", valueType: "scalar" },
	"text-color": { scaleName: null, valueType: "color" },
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
	scaleName: string | null;
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
			stagingKey: prefix.replace(/-$/g, ""),
		};
	}

	return null;
}

function filterAvailable(
	available: AvailableProperty[],
	classes: ParsedToken[],
	pending: Set<string>,
	staged?: Set<string>,
): AvailableProperty[] {
	const usedFullClasses = new Set(classes.map((c) => c.fullClass));
	const usedProperties = new Set(classes.map((c) => c.property));
	return available.filter((p) => {
		if (pending.has(p.prefix)) return false;
		if (staged?.has(p.prefix)) return false;
		const config = getPendingConfig(p.prefix);
		if (config?.valueType === "enum" && config.enumAlts) {
			return !config.enumAlts.some((alt) => usedFullClasses.has(alt));
		}
		// For scalars/colors, check if the property is already used
		if (config && config.valueType !== "enum") {
			// text-size and text-color share the 'text' property — check scaleName/color field
			if (p.prefix === "text-size")
				return !classes.some(
					(c) => c.property === "text" && c.scaleName === "fontSize",
				);
			if (p.prefix === "text-color")
				return !classes.some(
					(c) => c.property === "text" && c.color !== undefined,
				);
		}
		return !usedProperties.has(p.prefix.replace(/-$/g, ""));
	});
}

function groupBySection(classes: ParsedToken[]): Map<string, ParsedToken[]> {
	const groups = new Map<string, ParsedToken[]>();
	for (const cls of classes) {
		const section = cls.section ?? "unknown";
		const list = groups.get(section) || [];
		list.push(cls);
		groups.set(section, list);
	}
	return groups;
}

interface PickerProps {
	componentName: string;
	instanceCount: number;
	rawClasses: string;
	parsedClasses: ParsedToken[];
	tailwindConfig: any;
	patchManager: PatchManager;
}

export function Picker({
	componentName,
	instanceCount,
	rawClasses,
	parsedClasses,
	tailwindConfig,
	patchManager,
}: PickerProps) {
	const [selectedClass, setSelectedClass] = useState<ParsedToken | null>(null);
	// Local overrides for CornerModel slots staged this session.
	// string = overridden value, null = explicitly removed, absent = no change from parsedClasses
	const [cornerOverrides, setCornerOverrides] = useState<
		Map<CornerSlotKey, string | null>
	>(new Map());
	// Active color picker for a property chip (Backgrounds, etc.)
	const [chipColorPicker, setChipColorPicker] = useState<{
		cls: ParsedToken;
		anchorEl: Element;
	} | null>(null);
	// Active color picker for a shadow/ring layer swatch
	const [shadowColorPicker, setShadowColorPicker] = useState<{
		layer: ShadowLayerState;
		anchorEl: Element;
	} | null>(null);

	const {
		refs: chipColorPickerRefs,
		floatingStyles: chipColorPickerStyles,
		context: chipColorPickerContext,
	} = useFloating({
		open: chipColorPicker !== null || shadowColorPicker !== null,
		onOpenChange: (open) => {
			if (!open) {
				setChipColorPicker(null);
				setShadowColorPicker(null);
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
		const anchor = chipColorPicker?.anchorEl ?? shadowColorPicker?.anchorEl;
		if (anchor) chipColorPickerRefs.setReference(anchor);
	}, [chipColorPicker?.anchorEl, shadowColorPicker?.anchorEl]);

	// Prefixes activated via the "+" button but not yet staged
	const [pendingPrefixes, setPendingPrefixes] = useState<Set<string>>(
		new Set(),
	);

	// Reset local UI state when a different element is selected (classes string changes)
	// Note: patches persist across element switches — only local UI state resets
	const classesKeyRef = useRef(parsedClasses.map((c) => c.fullClass).join(" "));
	const currentClassesKey = parsedClasses.map((c) => c.fullClass).join(" ");
	useEffect(() => {
		if (classesKeyRef.current !== currentClassesKey) {
			classesKeyRef.current = currentClassesKey;
			patchManager.revertPreview();
			setCornerOverrides(new Map());
			setChipColorPicker(null);
			setPendingPrefixes(new Set());
		}
	});

	const elementKey = componentName;
	const stagedPatches = patchManager.patches.filter(
		(p) => p.status === "staged" && p.elementKey === elementKey,
	);
	// Prefixes that have a staged patch (from + button additions with originalClass === '')
	const stagedPendingPrefixes = new Set(
		stagedPatches.filter((p) => p.originalClass === "").map((p) => p.property),
	);

	/**
	 * Resolves the effective state for a CSS property by merging the element's
	 * current parsed classes with any staged patches.
	 */
	function resolvePropertyState(
		property: string,
		token: ParsedToken | undefined,
	) {
		const staged = stagedPatches.find((p) => p.property === property);
		const originalClass = token?.fullClass ?? staged?.originalClass ?? "";
		const effectiveClass = staged?.newClass ?? token?.fullClass ?? "";
		const hasValue = effectiveClass !== "";
		return { originalClass, effectiveClass, hasValue };
	}

	function applyCornerOverrides(state: CornerModelState): CornerModelState {
		if (cornerOverrides.size === 0) return state;
		const allOverride = cornerOverrides.get("all");
		return {
			...state,
			shorthandValue:
				allOverride === undefined ? state.shorthandValue : allOverride,
			slots: state.slots.map((s) => {
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
		sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" });
		if (cls.color !== undefined && anchorEl) {
			setChipColorPicker((prev) =>
				prev?.cls.fullClass === cls.fullClass ? null : { cls, anchorEl },
			);
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
		// If adding a flex-container property to an element without display:flex/inline-flex,
		// auto-stage `flex` so the grouped controls appear with a valid container.
		const rule = PROPERTY_RULES[prefix];
		if (
			rule?.controlGroup === "flex-container" &&
			rule?.propertyKey === "display"
		) {
			// flex/inline-flex have controlGroup AND propertyKey 'display' — skip, don't self-trigger
		} else if (rule?.controlGroup === "flex-container") {
			const hasFlexDisplay = parsedClasses.some(
				(c) => c.fullClass === "flex" || c.fullClass === "inline-flex",
			);
			const hasStagedFlexDisplay = stagedPatches.some(
				(p) =>
					p.property === "display" &&
					p.originalClass === "" &&
					(p.newClass === "flex" || p.newClass === "inline-flex"),
			);
			if (!hasFlexDisplay && !hasStagedFlexDisplay) {
				patchManager.stage(elementKey, "display", "", "flex");
			}
		}
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
			{(chipColorPicker || shadowColorPicker) && (
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
						{chipColorPicker && (
							<ColorGrid
								prefix={tokenClassPrefix(chipColorPicker.cls)}
								currentValue={chipColorPicker.cls.color ?? ""}
								colors={tailwindConfig?.colors || {}}
								locked={false}
								lockedValue={
									stagedPatches.find(
										(p) => p.property === chipColorPicker.cls.property,
									)?.newClass ?? null
								}
								onHover={(fullClass) =>
									handlePreview(chipColorPicker.cls.fullClass, fullClass)
								}
								onLeave={handleRevert}
								onClick={(fullClass) =>
									handleStage(
										chipColorPicker.cls.property,
										chipColorPicker.cls.fullClass,
										fullClass,
									)
								}
								onRemoveHover={() =>
									handlePreview(chipColorPicker.cls.fullClass, "")
								}
								onRemove={() => {
									handleStage(
										chipColorPicker.cls.property,
										chipColorPicker.cls.fullClass,
										"",
									);
									setChipColorPicker(null);
								}}
							/>
						)}
						{shadowColorPicker &&
							(() => {
								const { layer } = shadowColorPicker;
								const colorPrefix =
									layer.type === "shadow"
										? "shadow-"
										: layer.type === "inset-shadow"
											? "inset-shadow-"
											: layer.type === "ring"
												? "ring-"
												: layer.type === "text-shadow"
													? "text-shadow-"
													: "inset-ring-";
								const currentColorClass = layer.colorClass ?? "";
								const currentColorValue = currentColorClass
									? currentColorClass.slice(colorPrefix.length).split("/")[0]
									: "";
								return (
									<ColorGrid
										prefix={colorPrefix}
										currentValue={currentColorValue}
										colors={tailwindConfig?.colors || {}}
										locked={false}
										lockedValue={null}
										onHover={(fullClass) =>
											handlePreview(currentColorClass, fullClass)
										}
										onLeave={handleRevert}
										onClick={(fullClass) => {
											// Use shadow-color property to avoid dedup with size changes
											const colorProp =
												layer.type === "shadow"
													? "shadow-color"
													: layer.type === "inset-shadow"
														? "inset-shadow-color"
														: layer.type === "ring"
															? "ring-color"
															: layer.type === "text-shadow"
																? "text-shadow-color"
																: "inset-ring-color";
											patchManager.stage(
												elementKey,
												colorProp,
												currentColorClass,
												fullClass,
											);
											setShadowColorPicker(null);
										}}
										onRemoveHover={() => {
											if (currentColorClass)
												handlePreview(currentColorClass, "");
										}}
										onRemove={() => {
											if (currentColorClass) {
												const colorProp =
													layer.type === "shadow"
														? "shadow-color"
														: layer.type === "inset-shadow"
															? "inset-shadow-color"
															: layer.type === "ring"
																? "ring-color"
																: layer.type === "text-shadow"
																	? "text-shadow-color"
																	: "inset-ring-color";
												patchManager.stage(
													elementKey,
													colorProp,
													currentColorClass,
													"",
												);
											}
											setShadowColorPicker(null);
										}}
									/>
								);
							})()}
					</div>
				</FloatingPortal>
			)}

			{/* ── Property Sections — always rendered for every section ─── */}
			{ALL_SECTIONS.map((section) => {
				// 'shadows' is a special section handled entirely by ShadowEditor
				if (section === "shadows") {
					// Apply shadow-related staged patches on top of rawClasses, then parse.
					// computeEffectiveShadowClasses correctly handles the size-vs-color removal
					// distinction: color removal keeps the size class; size removal makes the row ghost.
					const effectiveClasses = computeEffectiveShadowClasses(
						rawClasses,
						stagedPatches,
					);
					const shadowLayers = parsedClassesToShadowLayers(
						effectiveClasses,
						tailwindConfig,
					);
					return (
						<PropertySection
							key="shadows"
							label="Shadows & Rings"
							onAddProperty={() => {}}
							isEmpty={false}
							classCount={shadowLayers.length}
						>
							<ShadowEditor
								layers={shadowLayers}
								onPreview={(oldClass, newClass) =>
									patchManager.preview(oldClass, newClass)
								}
								onRevert={() => patchManager.revertPreview()}
								onStage={(oldClass, newClass) => {
									const prefix = oldClass || newClass;
									// Distinguish size vs color classes to avoid dedup conflicts
									// Size classes: shadow-sm, shadow-lg, ring-1, ring-2, etc.
									// Color classes: shadow-red-500, ring-blue-600, etc.
									const isSizeClass = (cls: string) => {
										if (cls.startsWith("shadow-")) {
											const suffix = cls.slice("shadow-".length).split("/")[0];
											return SHADOW_SIZE_SET.has(suffix);
										}
										if (cls.startsWith("inset-shadow-")) {
											const suffix = cls
												.slice("inset-shadow-".length)
												.split("/")[0];
											return INSET_SHADOW_SIZE_SET.has(suffix);
										}
										if (
											cls.startsWith("ring-") ||
											cls.startsWith("inset-ring-")
										) {
											const suffix = cls
												.slice(
													cls.startsWith("ring-")
														? "ring-".length
														: "inset-ring-".length,
												)
												.split("/")[0];
											return RING_WIDTH_SET.has(suffix);
										}
										if (cls.startsWith("text-shadow-")) {
											const suffix = cls
												.slice("text-shadow-".length)
												.split("/")[0];
											return TEXT_SHADOW_SIZE_SET.has(suffix);
										}
										return false;
									};
									const baseType = prefix.startsWith("text-shadow")
										? "text-shadow"
										: prefix.startsWith("inset-shadow")
											? "inset-shadow"
											: prefix.startsWith("inset-ring")
												? "inset-ring"
												: prefix.startsWith("ring")
													? "ring"
													: "shadow";
									// Use distinct property keys: add '-size' suffix if changing a size class
									const isSizeChange =
										isSizeClass(oldClass) ||
										(oldClass === "" && isSizeClass(newClass));
									const prop = isSizeChange
										? `${baseType}-size`
										: `${baseType}-color`;
									patchManager.stage(elementKey, prop, oldClass, newClass);
								}}
								onAdd={(defaultClass) => {
									const prop = defaultClass.startsWith("text-shadow")
										? "text-shadow-size"
										: defaultClass.startsWith("inset-shadow")
											? "inset-shadow-size"
											: defaultClass.startsWith("inset-ring")
												? "inset-ring-size"
												: defaultClass.startsWith("ring")
													? "ring-size"
													: "shadow-size";
									patchManager.stage(elementKey, prop, "", defaultClass);
								}}
								onRemove={(classes) => {
									// Helper to determine if a class is a size class
									const isSizeClass = (cls: string) => {
										if (cls.startsWith("shadow-")) {
											const suffix = cls.slice("shadow-".length).split("/")[0];
											return SHADOW_SIZE_SET.has(suffix);
										}
										if (cls.startsWith("inset-shadow-")) {
											const suffix = cls
												.slice("inset-shadow-".length)
												.split("/")[0];
											return INSET_SHADOW_SIZE_SET.has(suffix);
										}
										if (
											cls.startsWith("ring-") ||
											cls.startsWith("inset-ring-")
										) {
											const suffix = cls
												.slice(
													cls.startsWith("ring-")
														? "ring-".length
														: "inset-ring-".length,
												)
												.split("/")[0];
											return RING_WIDTH_SET.has(suffix);
										}
										if (cls.startsWith("text-shadow-")) {
											const suffix = cls
												.slice("text-shadow-".length)
												.split("/")[0];
											return TEXT_SHADOW_SIZE_SET.has(suffix);
										}
										return false;
									};

									// Reverse so the size class is staged LAST to properly signal "ghost row" intent
									const reversed = [...classes].reverse();
									for (const cls of reversed) {
										const baseType = cls.startsWith("text-shadow")
											? "text-shadow"
											: cls.startsWith("inset-shadow")
												? "inset-shadow"
												: cls.startsWith("inset-ring")
													? "inset-ring"
													: cls.startsWith("ring")
														? "ring"
														: "shadow";
										const isSizeRemoval = isSizeClass(cls);
										const prop = isSizeRemoval
											? `${baseType}-size`
											: `${baseType}-color`;
										patchManager.stage(elementKey, prop, cls, "");
									}
								}}
								onRemoveHover={(classes) => {
									if (classes.length === 1)
										patchManager.preview(classes[0], "");
									else if (classes.length > 1)
										patchManager.preview(classes.join(" "), "");
								}}
								onColorClick={(layer, anchorEl) => {
									setChipColorPicker(null);
									setShadowColorPicker((prev) =>
										prev?.layer.type === layer.type
											? null
											: { layer, anchorEl },
									);
								}}
							/>
						</PropertySection>
					);
				}

				const sectionClasses = groups.get(section) || [];
				// Filter out classes consumed by composite components (CornerModel, GradientEditor, ShadowEditor)
				const classes = sectionClasses.filter((c) => !isCompositeConsumed(c));
				const addableProps =
					(
						ADDABLE_PROPERTIES_MAP as Record<
							string,
							(typeof ADDABLE_PROPERTIES_MAP)[Category]
						>
					)[section] || [];

				// ── Flex-parent detection ──────────────────────────────────────────────────
				// A single computed boolean: is this element a flex/grid container?
				// True when ANY member of the 'flex-container' controlGroup exists on the element OR is
				// pending/staged. Source of truth: controlGroup: 'flex-container' in propertyRules.ts.
				const flexContainerPropertyKeys =
					CONTROL_GROUP_PROPERTY_KEYS.get("flex-container") ??
					new Set<string>();
				const flexContainerRuleKeys =
					CONTROL_GROUP_RULE_KEYS.get("flex-container") ?? new Set<string>();
				const isFlexParentFromClasses = parsedClasses.some((c) => {
					// flex/inline-flex share propertyKey 'display' with non-flex display values,
					// so detect them by class name rather than propertyKey
					if (c.fullClass === "flex" || c.fullClass === "inline-flex")
						return true;
					const g = ENUM_GROUPS[c.fullClass];
					if (
						g &&
						g.propertyKey !== "display" &&
						flexContainerPropertyKeys.has(g.propertyKey)
					)
						return true;
					// Scalar group members (gap, gap-x, gap-y) don't appear in ENUM_GROUPS
					if (flexContainerPropertyKeys.has(c.property)) return true;
					return false;
				});
				const isFlexParentFromPending = [...flexContainerRuleKeys].some(
					(key) =>
						pendingPrefixes.has(key) ||
						stagedPendingPrefixes.has(key.replace(/-$/, "")),
				);
				const isFlexParent =
					section === "flexbox" &&
					(isFlexParentFromClasses || isFlexParentFromPending);
				const filteredAddableProps = isFlexParent
					? addableProps.filter((p) => !flexContainerRuleKeys.has(p.prefix))
					: addableProps;

				const available = filterAvailable(
					filteredAddableProps,
					classes,
					pendingPrefixes,
					stagedPendingPrefixes,
				);
				const sectionPendingPrefixes = addableProps
					.filter((p) => pendingPrefixes.has(p.prefix))
					.map((p) => p.prefix);
				const sectionStagedPrefixes = addableProps
					.filter((p) => stagedPendingPrefixes.has(p.prefix.replace(/-$/g, "")))
					.map((p) => p.prefix);

				const isEmpty =
					section === "color"
						? false // GradientEditor always renders
						: section === "flexbox" && isFlexParent
							? false // flex parent controls always render when isFlexParent
							: section === "borders"
								? false // CornerModel always renders
								: classes.length === 0 &&
									sectionPendingPrefixes.length === 0 &&
									sectionStagedPrefixes.length === 0;

				const classCount =
					section === "borders"
						? cornerModelStateFromClasses(parsedClasses).slots.filter(
								(s) => s.value != null,
							).length +
							(cornerModelStateFromClasses(parsedClasses).shorthandValue
								? 1
								: 0)
						: classes.length +
							sectionPendingPrefixes.length +
							sectionStagedPrefixes.length;

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
						{section === "borders" && (
							<CornerModel
								state={applyCornerOverrides(
									cornerModelStateFromClasses(parsedClasses),
								)}
								onSlotHover={(_key, value) => {
									const state = cornerModelStateFromClasses(parsedClasses);
									const slotValue =
										_key === "all"
											? (cornerOverrides.get("all") ?? state.shorthandValue)
											: (cornerOverrides.get(_key) ??
												state.slots.find((s) => s.key === _key)?.value ??
												null);
									const current = slotValue ?? "";
									if (value === null) patchManager.revertPreview();
									else patchManager.preview(current, value);
								}}
								onSlotChange={(_key, value) => {
									const state = cornerModelStateFromClasses(parsedClasses);
									const current =
										cornerOverrides.get(_key) ??
										(_key === "all"
											? state.shorthandValue
											: state.slots.find((s) => s.key === _key)?.value) ??
										"";
									handleStage(`rounded-${_key}`, current, value);
									setCornerOverrides((prev) => new Map(prev).set(_key, value));
								}}
								onSlotRemove={(_key) => {
									const current =
										cornerOverrides.get(_key) ??
										cornerModelStateFromClasses(parsedClasses).slots.find(
											(s) => s.key === _key,
										)?.value ??
										"";
									if (current) {
										handleStage(`rounded-${_key}`, current, "");
										setCornerOverrides((prev) => new Map(prev).set(_key, null));
									}
								}}
								onSlotRemoveHover={(_key) => {
									const current =
										cornerOverrides.get(_key) ??
										cornerModelStateFromClasses(parsedClasses).slots.find(
											(s) => s.key === _key,
										)?.value ??
										"";
									if (current) patchManager.preview(current, "");
								}}
								onEditStart={() =>
									sendTo("overlay", { type: "CLEAR_HIGHLIGHTS" })
								}
							/>
						)}

						{/* Composite: GradientEditor handles 'color' section */}
						{section === "color" && (
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

						{/* Composite: Flex-parent controls — show all when element is a flex container */}
						{section === "flexbox" &&
							isFlexParent &&
							(() => {
								const allFlexClasses = parsedClasses;
								const flexDirToken = allFlexClasses.find((c) => {
									const g = ENUM_GROUPS[c.fullClass];
									return g?.propertyKey === "flex-direction";
								});
								const justifyToken = allFlexClasses.find((c) => {
									const g = ENUM_GROUPS[c.fullClass];
									return g?.propertyKey === "justify-content";
								});
								const alignToken = allFlexClasses.find((c) => {
									const g = ENUM_GROUPS[c.fullClass];
									return g?.propertyKey === "align-items";
								});
								const wrapToken = allFlexClasses.find((c) => {
									const g = ENUM_GROUPS[c.fullClass];
									return g?.propertyKey === "flex-wrap";
								});

								const DIR_TO_CSS: Record<
									string,
									"row" | "column" | "row-reverse" | "column-reverse"
								> = {
									"flex-row": "row",
									"flex-col": "column",
									"flex-row-reverse": "row-reverse",
									"flex-col-reverse": "column-reverse",
								};
								const currentDir = flexDirToken?.fullClass ?? null;
								const cssFd = currentDir
									? (DIR_TO_CSS[currentDir] ?? "row")
									: "row";

								const flexDir = resolvePropertyState(
									"flex-direction",
									flexDirToken,
								);
								const flexWrap = resolvePropertyState("flex-wrap", wrapToken);
								const justify = resolvePropertyState(
									"justify-content",
									justifyToken,
								);
								const align = resolvePropertyState("align-items", alignToken);

								const gapToken = parsedClasses.find(
									(c) => c.property === "gap",
								);
								const gapXToken = parsedClasses.find(
									(c) => c.property === "gap-x",
								);
								const gapYToken = parsedClasses.find(
									(c) => c.property === "gap-y",
								);
								const gapState = resolvePropertyState("gap", gapToken);
								const gapXState = resolvePropertyState("gap-x", gapXToken);
								const gapYState = resolvePropertyState("gap-y", gapYToken);
								const gapSlots: GapSlotData[] = [
									{
										key: "gap",
										value: gapState.effectiveClass || null,
										scaleValues: getScaleValues(
											"gap-",
											"spacing",
											tailwindConfig,
										),
									},
									{
										key: "gap-x",
										value: gapXState.effectiveClass || null,
										scaleValues: getScaleValues(
											"gap-x-",
											"spacing",
											tailwindConfig,
										),
									},
									{
										key: "gap-y",
										value: gapYState.effectiveClass || null,
										scaleValues: getScaleValues(
											"gap-y-",
											"spacing",
											tailwindConfig,
										),
									},
								];

								return (
									<>
										<div className="flex justify-between items-start w-full">
											<FlexDirectionSelect
												currentValue={(flexDirToken?.fullClass ?? null) as any}
												lockedValue={
													flexDir.effectiveClass !== flexDir.originalClass
														? flexDir.effectiveClass
														: null
												}
												locked={false}
												onHover={(v) =>
													handlePreview(flexDir.effectiveClass, v)
												}
												onLeave={handleRevert}
												onClick={(v) =>
													handleStage(
														"flex-direction",
														flexDir.originalClass,
														v,
													)
												}
											/>
											<FlexWrapSelect
												currentValue={(wrapToken?.fullClass ?? null) as any}
												lockedValue={
													flexWrap.effectiveClass !== flexWrap.originalClass
														? flexWrap.effectiveClass
														: null
												}
												locked={false}
												onHover={(v) =>
													handlePreview(flexWrap.effectiveClass, v)
												}
												onLeave={handleRevert}
												onClick={(v) =>
													handleStage("flex-wrap", flexWrap.originalClass, v)
												}
											/>
											<FlexJustifySelect
												currentValue={justifyToken?.fullClass ?? null}
												lockedValue={
													justify.effectiveClass !== justify.originalClass
														? justify.effectiveClass
														: null
												}
												locked={false}
												flexDirection={cssFd}
												onHover={(v) =>
													handlePreview(justify.effectiveClass, v)
												}
												onLeave={handleRevert}
												onClick={(v) =>
													handleStage(
														"justify-content",
														justify.originalClass,
														v,
													)
												}
												onRemove={
													justify.hasValue
														? () =>
																handleStage(
																	"justify-content",
																	justify.originalClass,
																	"",
																)
														: undefined
												}
												onRemoveHover={
													justify.hasValue
														? () => handlePreview(justify.effectiveClass, "")
														: undefined
												}
											/>
											<FlexAlignSelect
												currentValue={alignToken?.fullClass ?? null}
												lockedValue={
													align.effectiveClass !== align.originalClass
														? align.effectiveClass
														: null
												}
												locked={false}
												flexDirection={cssFd}
												onHover={(v) => handlePreview(align.effectiveClass, v)}
												onLeave={handleRevert}
												onClick={(v) =>
													handleStage("align-items", align.originalClass, v)
												}
												onRemove={
													align.hasValue
														? () =>
																handleStage(
																	"align-items",
																	align.originalClass,
																	"",
																)
														: undefined
												}
												onRemoveHover={
													align.hasValue
														? () => handlePreview(align.effectiveClass, "")
														: undefined
												}
											/>
										</div>
										<div className="h-px w-full bg-bv-border opacity-50 my-2" />
										<GapModel
											slots={gapSlots}
											onSlotHover={(_key, value) => {
												const state =
													_key === "gap"
														? gapState
														: _key === "gap-x"
															? gapXState
															: gapYState;
												if (value === null) patchManager.revertPreview();
												else patchManager.preview(state.effectiveClass, value);
											}}
											onSlotRemoveHover={(_key) => {
												const state =
													_key === "gap"
														? gapState
														: _key === "gap-x"
															? gapXState
															: gapYState;
												if (state.hasValue)
													patchManager.preview(state.effectiveClass, "");
											}}
											onSlotChange={(_key, value) => {
												const state =
													_key === "gap"
														? gapState
														: _key === "gap-x"
															? gapXState
															: gapYState;
												handleStage(_key, state.originalClass, value);
											}}
											onSlotRemove={(_key) => {
												const state =
													_key === "gap"
														? gapState
														: _key === "gap-x"
															? gapXState
															: gapYState;
												if (state.hasValue) {
													patchManager.preview(state.effectiveClass, "");
													handleStage(_key, state.originalClass, "");
												}
											}}
										/>
									</>
								);
							})()}

						{/* Existing classes on the element */}
						{classes.map((cls) => {
							// Skip flex-container group classes when dedicated controls are shown above
							if (isFlexParent) {
								const grp = ENUM_GROUPS[cls.fullClass];
								if (grp && flexContainerPropertyKeys.has(grp.propertyKey))
									return null;
								// Scalar group members (gap, gap-x, gap-y) don't appear in ENUM_GROUPS
								if (flexContainerPropertyKeys.has(cls.property)) return null;
							}

							if (cls.scaleName !== undefined) {
								const scaleValues = getScaleValues(
									tokenClassPrefix(cls),
									cls.scaleName,
									tailwindConfig,
								);
								if (scaleValues.length > 0) {
									const stagedValue =
										stagedPatches.find((p) => p.property === cls.property)
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
												handleStage(cls.property, cls.fullClass, newClass)
											}
											onRemoveHover={() =>
												patchManager.preview(cls.fullClass, "")
											}
											onRemove={() =>
												handleStage(cls.property, cls.fullClass, "")
											}
										/>
									);
								}
							}
							if (cls.scaleName === undefined && cls.color === undefined) {
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
									className={`group flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border transition-colors ${
										selectedClass?.fullClass === cls.fullClass ||
										chipColorPicker?.cls.fullClass === cls.fullClass
											? "border-bv-border bg-bv-surface-hi text-bv-text"
											: "bg-bv-surface text-bv-text-mid border-transparent hover:border-bv-teal hover:text-bv-teal"
									}`}
									onClick={(e) => handleChipClick(cls, e.currentTarget)}
								>
									{cls.fullClass}
									<span
										className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-0.5 shrink-0"
										title="Remove class"
										onClick={(e) => {
											e.stopPropagation();
											handleStage(cls.property, cls.fullClass, "");
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
										<svg
											viewBox="0 0 10 10"
											width="8"
											height="8"
											xmlns="http://www.w3.org/2000/svg"
										>
											<line
												x1="1"
												y1="1"
												x2="9"
												y2="9"
												stroke="#F5532D"
												strokeWidth="1.8"
												strokeLinecap="round"
											/>
											<line
												x1="9"
												y1="1"
												x2="1"
												y2="9"
												stroke="#F5532D"
												strokeWidth="1.8"
												strokeLinecap="round"
											/>
										</svg>
									</span>
								</div>
							);
						})}

						{/* Staged pending values (from + button, user picked a value) */}
						{sectionStagedPrefixes
							.filter((prefix) => {
								// Skip flex-container group staged prefixes — consumed by the grouped flex controls
								if (isFlexParent && flexContainerRuleKeys.has(prefix))
									return false;
								return true;
							})
							.map((prefix) => {
								const config = getPendingConfig(prefix);
								if (!config) return null;
								if (config.valueType === "scalar") {
									const scaleValues = getScaleValues(
										prefix,
										config.scaleName,
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
											onClick={(newClass) =>
												handlePendingStage(prefix, newClass)
											}
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
											onClick={(newClass) =>
												handlePendingStage(prefix, newClass)
											}
										/>
									);
								}
								return null;
							})}

						{/* Pending ghost scrubbers from + button (not yet staged) */}
						{sectionPendingPrefixes
							.filter((prefix) => {
								// Skip flex-container group pending prefixes — consumed by the grouped flex controls
								if (isFlexParent && flexContainerRuleKeys.has(prefix))
									return false;
								return true;
							})
							.map((prefix) => {
								const config = getPendingConfig(prefix);
								if (!config) return null;
								if (config.valueType === "scalar") {
									const scaleValues = getScaleValues(
										prefix,
										config.scaleName,
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
											onClick={(newClass) =>
												handlePendingStage(prefix, newClass)
											}
										/>
									);
								}
								if (config.valueType === "color") {
									return (
										<div
											key={`pending-${prefix}`}
											data-testid={`pending-ghost-${prefix}`}
											className="px-2 py-0.5 rounded cursor-pointer text-[11px] font-mono border border-dashed border-bv-border text-bv-muted hover:border-bv-teal hover:text-bv-teal transition-colors"
											onClick={(e) => {
												const ghostToken: ParsedToken = {
													property: "text",
													fullClass: "",
													section: "typography",
													color: "",
												};
												setChipColorPicker({
													cls: ghostToken,
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
