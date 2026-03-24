import { useCallback, useRef, useState } from "react";
import type { BackgroundMode, GradientDirection } from "../DirectionPicker";
import type { GradientStop } from "../GradientBar";
import type { GradientEditorProps } from "./types";
import { DIR_TO_CSS } from "./types";

/**
 * Manages internal state for the GradientEditor.
 * Takes initial values from parsed classes and provides
 * handlers for all interactions.
 */
export function useGradientState(props: GradientEditorProps) {
	const {
		direction: initialDir,
		stops: initialStops,
		mode: initialMode,
		solidColorName: initialSolidName,
		solidColorHex: initialSolidHex,
		onPreview,
		onPreviewBatch,
		onRevert,
		onStage,
	} = props;

	const [direction, setDirection] = useState<GradientDirection>(initialDir);
	const [stops, setStops] = useState<GradientStop[]>(initialStops);
	const [mode, setMode] = useState<BackgroundMode>(initialMode);
	const [solidColorName, setSolidColorName] = useState<string | null>(
		initialSolidName,
	);
	const [solidColorHex, setSolidColorHex] = useState<string | null>(
		initialSolidHex,
	);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [colorPickerOpen, setColorPickerOpen] = useState(false);
	const [editingTarget, setEditingTarget] = useState<"stop" | "solid" | null>(
		null,
	);
	const [anchorEl, setAnchorEl] = useState<Element | null>(null);
	const nextIdRef = useRef(initialStops.length + 1);
	const [fillHidden, setFillHidden] = useState(false);
	const savedFillRef = useRef<{
		mode: BackgroundMode;
		solidColorName: string | null;
		solidColorHex: string | null;
		direction: GradientDirection;
		stops: GradientStop[];
	} | null>(null);

	// --- Direction ---
	const handleDirectionHover = useCallback(
		(dir: GradientDirection) => {
			if (mode === "gradient") {
				// Already in gradient mode — just preview the direction change
				onPreview(`bg-gradient-to-${direction}`, `bg-gradient-to-${dir}`);
			} else {
				// Previewing a transition from solid → gradient: atomically show direction + stops
				const baseColor = solidColorName ?? "slate-500";
				const oldBg = solidColorName ? `bg-${solidColorName}` : "";
				onPreviewBatch([
					{ oldClass: oldBg, newClass: `bg-gradient-to-${dir}` },
					{ oldClass: "", newClass: `from-${baseColor}` },
					{ oldClass: "", newClass: `to-${baseColor}` },
				]);
			}
		},
		[direction, mode, solidColorName, onPreview, onPreviewBatch],
	);

	const handleDirectionLeave = useCallback(() => {
		onRevert();
	}, [onRevert]);

	const handleDirectionClick = useCallback(
		(dir: GradientDirection) => {
			setDirection(dir);
			setMode("gradient");

			if (mode === "gradient" && stops.length >= 2) {
				// Already have gradient stops — just update the direction class
				const oldClass = `bg-gradient-to-${direction}`;
				const newClass = `bg-gradient-to-${dir}`;
				onStage(oldClass, newClass);
			} else {
				// Transitioning from solid (or empty) — seed two stops from the solid color
				// from- defaults to 0%, to- defaults to 100%
				const baseColor = solidColorName ?? "slate-500";
				const baseHex =
					solidColorHex ?? resolveColorHex(baseColor, props.colors);
				const fromStop: GradientStop = {
					id: "1",
					role: "from",
					colorName: baseColor,
					hex: baseHex,
					position: 0,
				};
				const toStop: GradientStop = {
					id: "2",
					role: "to",
					colorName: baseColor,
					hex: baseHex,
					position: 100,
				};
				nextIdRef.current = 3;
				setStops([fromStop, toStop]);

				// Remove old solid bg and add gradient classes as separate calls
				// so each stays within its own property key domain
				if (solidColorName) onStage(`bg-${solidColorName}`, "");
				onStage("", `bg-gradient-to-${dir}`);
				onStage("", `from-${baseColor}`);
				onStage("", `to-${baseColor}`);
			}
		},
		[
			direction,
			mode,
			stops,
			solidColorName,
			solidColorHex,
			props.colors,
			onStage,
		],
	);

	const handleSolidToggle = useCallback(() => {
		setMode("solid");
		setColorPickerOpen(false);
		setSelectedStopId(null);
		setEditingTarget(null);
		// Use first stop's color as the default solid color
		if (stops.length > 0 && !solidColorName) {
			setSolidColorName(stops[0].colorName);
			setSolidColorHex(stops[0].hex);
		}
	}, [stops, solidColorName]);

	// --- Add gradient from empty state ---
	const handleAddGradient = useCallback(() => {
		const dir: GradientDirection = "r";
		const fromColor = "slate-400";
		const toColor = "slate-600";
		const fromHex = resolveColorHex(fromColor, props.colors);
		const toHex = resolveColorHex(toColor, props.colors);
		const fromStop: GradientStop = {
			id: "1",
			role: "from",
			colorName: fromColor,
			hex: fromHex,
			position: 0,
		};
		const toStop: GradientStop = {
			id: "2",
			role: "to",
			colorName: toColor,
			hex: toHex,
			position: 100,
		};
		nextIdRef.current = 3;

		setDirection(dir);
		setMode("gradient");
		setStops([fromStop, toStop]);
		setSolidColorName(null);
		setSolidColorHex(null);

		onStage("", `bg-gradient-to-${dir}`);
		onStage("", `from-${fromColor}`);
		onStage("", `to-${toColor}`);
	}, [props.colors, onStage]);

	// --- Remove entire fill ---
	const handleRemoveFill = useCallback(() => {
		if (mode === "solid") {
			if (solidColorName) onStage(`bg-${solidColorName}`, "");
		} else if (mode === "gradient") {
			onStage(`bg-gradient-to-${direction}`, "");
			stops.forEach((s) => {
				onStage(`${s.role}-${s.colorName}`, "");
			});
		}
		setMode("solid");
		setSolidColorName(null);
		setSolidColorHex(null);
		setStops([]);
		setColorPickerOpen(false);
		setSelectedStopId(null);
		setEditingTarget(null);
		setAnchorEl(null);
		setFillHidden(false);
		savedFillRef.current = null;
	}, [mode, direction, stops, solidColorName, onStage]);

	// --- Toggle fill visibility (eye icon) ---
	const handleToggleFillVisibility = useCallback(() => {
		if (!fillHidden) {
			// Hide: save current state and stage removals
			savedFillRef.current = {
				mode,
				solidColorName,
				solidColorHex,
				direction,
				stops: [...stops],
			};
			if (mode === "solid" && solidColorName) {
				onStage(`bg-${solidColorName}`, "");
			} else if (mode === "gradient") {
				onStage(`bg-gradient-to-${direction}`, "");
				for (const s of stops) {
					onStage(`${s.role}-${s.colorName}`, "");
				}
			}
			setFillHidden(true);
		} else {
			// Show: restore from saved state
			const saved = savedFillRef.current;
			if (saved) {
				if (saved.mode === "solid" && saved.solidColorName) {
					onStage("", `bg-${saved.solidColorName}`);
					setSolidColorName(saved.solidColorName);
					setSolidColorHex(saved.solidColorHex);
					setMode("solid");
				} else if (saved.mode === "gradient") {
					onStage("", `bg-gradient-to-${saved.direction}`);
					for (const s of saved.stops) {
						onStage("", `${s.role}-${s.colorName}`);
					}
					setDirection(saved.direction);
					setStops(saved.stops);
					setMode("gradient");
				}
				savedFillRef.current = null;
			}
			setFillHidden(false);
		}
	}, [fillHidden, mode, solidColorName, solidColorHex, direction, stops, onStage]);

	// --- Stop removal preview ---
	const handleStopRemoveHover = useCallback(
		(stopId: string) => {
			const stop = stops.find((s) => s.id === stopId);
			if (stop) {
				onPreview(`${stop.role}-${stop.colorName}`, "");
			}
		},
		[stops, onPreview],
	);

	const handleStopRemoveLeave = useCallback(() => {
		onRevert();
	}, [onRevert]);

	// --- Add fill from empty state ---
	const handleAddFill = useCallback(() => {
		const defaultColor = "slate-400";
		const defaultHex = resolveColorHex(defaultColor, props.colors);
		setMode("solid");
		setSolidColorName(defaultColor);
		setSolidColorHex(defaultHex);
		onStage("", `bg-${defaultColor}`);
	}, [props.colors, onStage]);

	// --- Stop dragging ---
	const handleStopDrag = useCallback(
		(stopId: string, newPosition: number) => {
			setStops((prev) =>
				prev.map((s) =>
					s.id === stopId ? { ...s, position: newPosition } : s,
				),
			);
			const stop = stops.find((s) => s.id === stopId);
			if (stop) {
				const oldPos =
					stop.position != null ? `${stop.role}-${stop.position}%` : "";
				const newPos = `${stop.role}-${newPosition}%`;
				onPreview(oldPos, newPos);
			}
		},
		[stops, onPreview],
	);

	const handleStopDragEnd = useCallback(
		(stopId: string, position: number) => {
			setStops((prev) =>
				prev.map((s) => (s.id === stopId ? { ...s, position } : s)),
			);
			const stop = stops.find((s) => s.id === stopId);
			if (stop) {
				const oldPos =
					stop.position != null ? `${stop.role}-${stop.position}%` : "";
				const newPos = `${stop.role}-${position}%`;
				onStage(oldPos, newPos);
			}
		},
		[stops, onStage],
	);

	// --- Stop click (open color picker) ---
	const handleStopClick = useCallback(
		(stopId: string, el: Element) => {
			if (selectedStopId === stopId && colorPickerOpen) {
				setSelectedStopId(null);
				setColorPickerOpen(false);
				setEditingTarget(null);
				setAnchorEl(null);
			} else {
				setSelectedStopId(stopId);
				setColorPickerOpen(true);
				setEditingTarget("stop");
				setAnchorEl(el);
			}
		},
		[selectedStopId, colorPickerOpen],
	);

	// --- Add stop ---
	const handleBarClick = useCallback(
		(position: number) => {
			const id = String(nextIdRef.current++);
			// Use the nearest stop's color as a default
			const sorted = [...stops].sort(
				(a, b) => (a.position ?? 0) - (b.position ?? 0),
			);
			let bestColor = sorted[0];
			for (const s of sorted) {
				if ((s.position ?? 0) <= position) bestColor = s;
			}
			const newStop: GradientStop = {
				id,
				role: "via",
				colorName: bestColor?.colorName ?? "gray-500",
				hex: bestColor?.hex ?? "#6B7280",
				position,
			};
			setStops((prev) => [...prev, newStop]);
			setSelectedStopId(id);
			setColorPickerOpen(true);
			setEditingTarget("stop");
			// anchorEl stays null for bar clicks — position will update when reference is set
		},
		[stops],
	);

	// --- Remove stop ---
	const handleStopRemove = useCallback(
		(stopId: string) => {
			const stop = stops.find((s) => s.id === stopId);
			if (!stop) return;

			const remaining = stops.filter((s) => s.id !== stopId);

			setSelectedStopId(null);
			setColorPickerOpen(false);
			setEditingTarget(null);
			setAnchorEl(null);

			if (remaining.length >= 2) {
				// Gradient still valid — just remove this stop
				setStops(remaining);
				onStage(`${stop.role}-${stop.colorName}`, "");
			} else if (remaining.length === 1) {
				// Drop to solid mode using the surviving stop's color
				const survivor = remaining[0];
				setStops([]);
				setMode("solid");
				setSolidColorName(survivor.colorName);
				setSolidColorHex(survivor.hex);
				onStage(`bg-gradient-to-${direction}`, "");
				stops.forEach((s) => {
					onStage(`${s.role}-${s.colorName}`, "");
				});
				onStage("", `bg-${survivor.colorName}`);
			} else {
				// No stops remain — go to empty state
				setStops([]);
				setMode("none");
				setSolidColorName(null);
				setSolidColorHex(null);
				onStage(`bg-gradient-to-${direction}`, "");
				stops.forEach((s) => {
					onStage(`${s.role}-${s.colorName}`, "");
				});
			}
		},
		[stops, direction, onStage],
	);

	// --- Solid swatch click ---
	const handleSwatchClick = useCallback((el: Element) => {
		setColorPickerOpen(true);
		setEditingTarget("solid");
		setSelectedStopId(null);
		setAnchorEl(el);
	}, []);

	// --- Preview solid color removal (hover over X cell) ---
	const handleHoverRemoveSolid = useCallback(() => {
		onPreview(solidColorName ? `bg-${solidColorName}` : "", "");
	}, [solidColorName, onPreview]);

	// --- Remove solid color class entirely ---
	const handleRemoveSolid = useCallback(() => {
		if (solidColorName) {
			onStage(`bg-${solidColorName}`, "");
		}
		setSolidColorName(null);
		setSolidColorHex(null);
		setColorPickerOpen(false);
		setEditingTarget(null);
		setAnchorEl(null);
	}, [solidColorName, onStage]);

	// --- Color grid interactions ---
	const handleColorHover = useCallback(
		(fullClass: string) => {
			if (editingTarget === "stop" && selectedStopId) {
				const stop = stops.find((s) => s.id === selectedStopId);
				if (stop) {
					onPreview(`${stop.role}-${stop.colorName}`, fullClass);
				}
			} else if (editingTarget === "solid") {
				onPreview(`bg-${solidColorName}`, fullClass);
			}
		},
		[editingTarget, selectedStopId, stops, solidColorName, onPreview],
	);

	const handleColorLeave = useCallback(() => {
		onRevert();
	}, [onRevert]);

	const handleColorClick = useCallback(
		(fullClass: string) => {
			// fullClass is e.g. 'from-blue-500' or 'bg-blue-500'
			if (editingTarget === "stop" && selectedStopId) {
				const stop = stops.find((s) => s.id === selectedStopId);
				if (stop) {
					// Extract color name from the fullClass (strip the prefix)
					const prefix = stop.role + "-";
					const colorName = fullClass.startsWith(prefix)
						? fullClass.slice(prefix.length)
						: fullClass;
					setStops((prev) =>
						prev.map((s) =>
							s.id === selectedStopId
								? {
										...s,
										colorName,
										hex: resolveColorHex(colorName, props.colors),
									}
								: s,
						),
					);
					onStage(
						`${stop.role}-${stop.colorName}`,
						`${stop.role}-${colorName}`,
					);
					setColorPickerOpen(false);
					setSelectedStopId(null);
					setEditingTarget(null);
					setAnchorEl(null);
				}
			} else if (editingTarget === "solid") {
				const prefix = "bg-";
				const colorName = fullClass.startsWith(prefix)
					? fullClass.slice(prefix.length)
					: fullClass;
				const oldClass = solidColorName ? `bg-${solidColorName}` : "";
				setSolidColorName(colorName);
				setSolidColorHex(resolveColorHex(colorName, props.colors));
				onStage(oldClass, `bg-${colorName}`);
				setColorPickerOpen(false);
				setEditingTarget(null);
				setAnchorEl(null);
			}
		},
		[
			editingTarget,
			selectedStopId,
			stops,
			solidColorName,
			onStage,
			props.colors,
		],
	);

	const handleCloseColorPicker = useCallback(() => {
		setColorPickerOpen(false);
		setSelectedStopId(null);
		setEditingTarget(null);
		setAnchorEl(null);
		onRevert();
	}, [onRevert]);

	// The prefix for the ColorGrid depends on what we're editing
	const colorPrefix =
		editingTarget === "stop" && selectedStopId
			? (stops.find((s) => s.id === selectedStopId)?.role ?? "from") + "-"
			: "bg-";

	const colorPickerCurrentValue =
		editingTarget === "stop" && selectedStopId
			? (stops.find((s) => s.id === selectedStopId)?.colorName ?? "")
			: (solidColorName ?? "");

	const directionCSS = DIR_TO_CSS[direction];

	const selectedStop = selectedStopId
		? stops.find((s) => s.id === selectedStopId)
		: null;
	const selectedStopIsRemovable = !!selectedStop;

	return {
		direction,
		stops,
		mode,
		solidColorName,
		solidColorHex,
		selectedStopId,
		colorPickerOpen,
		editingTarget,
		anchorEl,
		colorPrefix,
		colorPickerCurrentValue,
		directionCSS,
		selectedStopIsRemovable,
		fillHidden,
		handleDirectionHover,
		handleDirectionLeave,
		handleDirectionClick,
		handleSolidToggle,
		handleRemoveFill,
		handleToggleFillVisibility,
		handleAddFill,
		handleAddGradient,
		handleStopRemoveHover,
		handleStopRemoveLeave,
		handleStopDrag,
		handleStopDragEnd,
		handleStopClick,
		handleBarClick,
		handleStopRemove,
		handleSwatchClick,
		handleHoverRemoveSolid,
		handleRemoveSolid,
		handleColorHover,
		handleColorLeave,
		handleColorClick,
		handleCloseColorPicker,
	};
}

export function resolveColorHex(
	colorName: string,
	colors: Record<string, any>,
): string {
	console.log(
		`[resolveColorHex] Looking up colorName="${colorName}", available top-level keys:`,
		Object.keys(colors).join(", "),
	);

	// Handle direct colors like 'black', 'white', 'transparent'
	if (typeof colors[colorName] === "string") {
		console.log(
			`[resolveColorHex] Found direct match: colors["${colorName}"] = "${colors[colorName]}"`,
		);
		return colors[colorName];
	}

	// Handle object with DEFAULT key (e.g. destructive: { DEFAULT: '#ef4444', foreground: '...' })
	// `bg-destructive` maps to colors.destructive.DEFAULT in Tailwind
	if (
		colors[colorName] &&
		typeof colors[colorName] === "object" &&
		typeof colors[colorName].DEFAULT === "string"
	) {
		console.log(
			`[resolveColorHex] Found DEFAULT match: colors["${colorName}"].DEFAULT = "${colors[colorName].DEFAULT}"`,
		);
		return colors[colorName].DEFAULT;
	}

	// Handle hue-shade like 'blue-500'
	const dashIdx = colorName.lastIndexOf("-");
	if (dashIdx > 0) {
		const hue = colorName.slice(0, dashIdx);
		const shade = colorName.slice(dashIdx + 1);
		console.log(
			`[resolveColorHex] Trying hue="${hue}" shade="${shade}", colors["${hue}"] =`,
			typeof colors[hue],
			colors[hue]
				? Object.keys(colors[hue]).slice(0, 5).join(", ")
				: "undefined",
		);
		if (colors[hue] && typeof colors[hue][shade] === "string") {
			console.log(
				`[resolveColorHex] Found hue-shade match: colors["${hue}"]["${shade}"] = "${colors[hue][shade]}"`,
			);
			return colors[hue][shade];
		}
	}

	console.warn(
		`[resolveColorHex] FALLBACK #888888 for colorName="${colorName}" — color not found in config`,
	);
	return "#888888";
}
