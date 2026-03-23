import { useRef, useState } from "react";
import { ScaleScrubber } from "../ScaleScrubber";
import type { ShadowLayerRowProps } from "./types";
import {
	displayToFullClass,
	fullClassToDisplay,
	getDisplayScale,
	LAYER_LABELS,
	layerToPreviewCSS,
	layerToPreviewTextShadowCSS,
} from "./types";

/** Opacity scale: 0% to 100% in 5% steps */
const OPACITY_DISPLAY = Array.from({ length: 21 }, (_, i) => `${i * 5}%`);

export function ShadowLayerRow({
	layer,
	onSizeHover,
	onSizeLeave,
	onSizeClick,
	onColorClick,
	onOpacityHover,
	onOpacityLeave,
	onOpacityClick,
	onRemove,
	onRemoveHover,
}: ShadowLayerRowProps) {
	const [hovered, setHovered] = useState(false);
	// Debounce hide so moving between adjacent cells doesn't flicker the × button
	const hideTimer = useRef<ReturnType<typeof setTimeout>>();
	const cellHoverProps = {
		onMouseEnter: () => {
			clearTimeout(hideTimer.current);
			setHovered(true);
		},
		onMouseLeave: () => {
			hideTimer.current = setTimeout(() => setHovered(false), 60);
		},
	};

	const displayScale = getDisplayScale(layer.type);
	const previewShadow = layerToPreviewCSS(layer);
	const previewTextShadow =
		layer.type === "text-shadow" ? layerToPreviewTextShadowCSS(layer) : "none";
	const isDisabled = layer.isNone;

	// Current display value (short suffix)
	const currentDisplay = layer.sizeClass
		? fullClassToDisplay(layer.type, layer.sizeClass)
		: displayScale[0];

	// Opacity display
	const hasColor = !!layer.colorHex;
	const opacityDisplay = layer.opacity !== null ? `${layer.opacity}%` : "100%";

	// Resolve display color — explicit color or Tailwind default from theme
	const isDefaultColor = !layer.colorHex;

	// Use resolved colorHex for the swatch (explicit, or theme default, or null)
	const colorSwatchBg = layer.colorHex ?? layer.defaultColorCSS ?? null;

	// Label for the hex display
	const displayColorLabel = layer.colorHex
		? layer.colorHex.replace("#", "").toUpperCase()
		: layer.defaultColorCSS ?? null;

	// Wrap size callbacks to translate display → full class
	function handleSizeHover(displayVal: string) {
		onSizeHover(displayToFullClass(layer.type, displayVal));
	}
	function handleSizeClick(displayVal: string) {
		onSizeClick(displayToFullClass(layer.type, displayVal));
	}

	// Each child is a direct grid cell in the parent ShadowEditor grid.
	// No wrapper divs — elements are the grid items directly so alignment is clean.
	return (
		<>
			{/* Col 1: orange dot */}
			<span className="flex items-center justify-center" {...cellHoverProps}>
				<span className="w-1 h-1 rounded-full bg-bv-orange" />
			</span>

			{/* Col 2: layer name */}
			<span
				className="flex items-center text-[9px] font-semibold uppercase tracking-[0.8px] text-bv-text-mid font-mono whitespace-nowrap"
				{...cellHoverProps}
			>
				{LAYER_LABELS[layer.type]}
			</span>

			{/* Col 3: Size scrubber */}
			<span className="flex items-center min-w-0" {...cellHoverProps}>
				<ScaleScrubber
					values={displayScale}
					currentValue={currentDisplay}
					lockedValue={null}
					locked={false}
					onHover={handleSizeHover}
					onLeave={onSizeLeave}
					onClick={handleSizeClick}
				/>
			</span>

			{/* Col 4: Combined color + opacity (Figma-style) */}
			<div
				className={`flex items-center h-[26px] rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] overflow-hidden min-w-0 ${isDisabled ? "opacity-30 pointer-events-none" : ""}`}
				{...cellHoverProps}
			>
				{/* Color swatch */}
				<button
					type="button"
					className="w-[26px] h-full shrink-0 cursor-pointer border-none bg-transparent p-0 flex items-center justify-center"
					onClick={(e) => onColorClick(e.currentTarget)}
					title={layer.colorClass ? layer.colorClass : "Default color — click to override"}
				>
					{layer.colorHex ? (
						<div
							className="w-[18px] h-[18px] rounded-[3px] border border-[rgba(255,255,255,0.15)]"
							style={{
								background: colorSwatchBg,
								opacity: layer.opacity !== null ? layer.opacity / 100 : 1,
							}}
						/>
					) : colorSwatchBg ? (
						<div
							className="w-[18px] h-[18px] rounded-[3px] border border-dashed border-[rgba(255,255,255,0.15)]"
							style={{ background: colorSwatchBg, opacity: 0.5 }}
						/>
					) : (
						<span className="w-1.5 h-1.5 rounded-full bg-bv-text-mid opacity-40" />
					)}
				</button>
				{/* Hex color value */}
				<button
					type="button"
					className={`flex-1 min-w-0 h-full border-none bg-transparent cursor-pointer px-1 flex items-center font-mono text-[11px] truncate hover:text-bv-teal transition-colors ${isDefaultColor ? "text-bv-muted italic" : "text-bv-text-mid"}`}
					onClick={(e) => onColorClick(e.currentTarget)}
				>
					{displayColorLabel ?? "\u2014"}
				</button>
				{/* Divider */}
				<span className="w-px h-3.5 bg-[rgba(255,255,255,0.10)] shrink-0" />
				{/* Opacity value */}
				{hasColor && !isDisabled ? (
					<span className="shrink-0 w-12 flex items-center min-w-0">
						<ScaleScrubber
							values={OPACITY_DISPLAY}
							currentValue={opacityDisplay}
							lockedValue={null}
							locked={false}
							onHover={onOpacityHover}
							onLeave={onOpacityLeave}
							onClick={onOpacityClick}
						/>
					</span>
				) : (
					<span className="shrink-0 w-12 flex items-center justify-center font-mono text-[11px] text-bv-muted select-none">
						0%
					</span>
				)}
			</div>

			{/* Col 5: Inline preview square */}
			<span
				className="ml-4 flex w-[26px] h-[26px] rounded-[5px] bg-bv-surface-hi border border-bv-border transition-[box-shadow] duration-200 items-center justify-center overflow-hidden"
				style={layer.type === "text-shadow" ? {} : { boxShadow: previewShadow }}
				title={`Preview: ${layer.sizeClass ?? ""} ${layer.colorClass ?? ""}`.trim()}
				{...cellHoverProps}
			>
				{layer.type === "text-shadow" && (
					<span
						className="text-[11px] font-semibold text-bv-text select-none transition-[text-shadow] duration-200"
						style={{ textShadow: previewTextShadow }}
					>
						Aa
					</span>
				)}
			</span>

			{/* Col 6: Remove button */}
			<button
				type="button"
				className={`ml-4 w-[18px] h-[18px] rounded-[3px] border-none bg-transparent text-bv-muted text-xs cursor-pointer flex items-center justify-center transition-all hover:text-bv-orange hover:bg-bv-orange/10 ${hovered ? "opacity-100" : "opacity-0"}`}
				onClick={onRemove}
				onMouseEnter={() => {
					clearTimeout(hideTimer.current);
					setHovered(true);
					onRemoveHover();
				}}
				onMouseLeave={() => {
					hideTimer.current = setTimeout(() => setHovered(false), 60);
				}}
				title="Remove layer"
			>
				×
			</button>
		</>
	);
}
