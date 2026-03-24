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
import { useEffect } from "react";
import { ColorGrid } from "../ColorGrid";
import { DirectionDropdown } from "../DirectionDropdown";
import { GradientBar } from "../GradientBar";
import { GradientStopRow } from "../GradientStopRow";
import type { GradientEditorProps } from "./types";
import { useGradientState } from "./useGradientState";

export function GradientEditor(props: GradientEditorProps) {
	const state = useGradientState(props);
	const isSolid = state.mode === "solid";
	const isGradient = state.mode === "gradient";
	const hasFill = isSolid ? !!state.solidColorName : isGradient;

	const { refs, floatingStyles, context } = useFloating({
		open: state.colorPickerOpen,
		onOpenChange: (open) => {
			if (!open) state.handleCloseColorPicker();
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
	const dismiss = useDismiss(context);
	const { getFloatingProps } = useInteractions([dismiss]);

	useEffect(() => {
		if (state.anchorEl) {
			refs.setReference(state.anchorEl);
		}
	}, [state.anchorEl, refs]);

	if (!hasFill) {
		return (
			<div className="flex items-center gap-1.5 w-full">
				<button
					type="button"
					className="flex items-center gap-1 h-7 px-2 rounded text-[11px] text-bv-muted cursor-pointer border border-dashed border-bv-border bg-transparent transition-colors hover:text-bv-text hover:border-bv-text-mid"
					onClick={state.handleAddFill}
				>
					<svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
					</svg>
					Solid
				</button>
				<button
					type="button"
					className="flex items-center gap-1 h-7 px-2 rounded text-[11px] text-bv-muted cursor-pointer border border-dashed border-bv-border bg-transparent transition-colors hover:text-bv-text hover:border-bv-text-mid"
					onClick={state.handleAddGradient}
				>
					<svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
					</svg>
					Gradient
				</button>
			</div>
		);
	}

	return (
		<div className={`w-full space-y-2${state.fillHidden ? " opacity-40" : ""}`}>
			{/* Header row: type + direction + visibility + delete */}
			<div className="flex items-center gap-1.5 h-7">
			{/* Solid: inline swatch */}
				{isSolid && (
					<button
						type="button"
						className="w-5 h-5 rounded border border-[rgba(255,255,255,0.15)] shrink-0 cursor-pointer p-0 bg-transparent"
						style={{ background: state.solidColorHex ?? "transparent" }}
						onClick={(e) => state.handleSwatchClick(e.currentTarget)}
						title={state.solidColorName ? `bg-${state.solidColorName}` : "Pick color"}
						disabled={state.fillHidden}
					/>
				)}

				{/* Type label */}
				<span className="h-6.5 px-2 flex items-center rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] text-[11px] text-bv-text-mid select-none">
					{isSolid ? "Solid" : "Linear"}
				</span>

				{/* Solid: color name button */}
				{isSolid && (
					<button
						type="button"
						className="flex items-center gap-1 h-6.5 px-1.5 rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] text-[11px] font-mono text-bv-text-mid cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-bv-teal truncate"
						onClick={(e) => state.handleSwatchClick(e.currentTarget)}
						disabled={state.fillHidden}
					>
						{state.solidColorName ?? "none"}
					</button>
				)}

				{/* Gradient: direction dropdown */}
				{isGradient && (
					<DirectionDropdown
						direction={state.direction}
						onHover={state.handleDirectionHover}
						onLeave={state.handleDirectionLeave}
						onClick={state.handleDirectionClick}
					/>
				)}

				{/* Spacer */}
				<span className="flex-1" />

				{/* Eye toggle — visibility */}
				<button
					type="button"
					className={`w-5 h-5 border-none bg-transparent cursor-pointer flex items-center justify-center shrink-0 transition-colors rounded ${
						state.fillHidden ? "text-bv-muted" : "text-bv-text-mid hover:text-bv-text"
					}`}
					onClick={state.handleToggleFillVisibility}
					title={state.fillHidden ? "Show fill" : "Hide fill"}
				>
					{state.fillHidden ? (
						<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
						</svg>
					) : (
						<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
							<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
						</svg>
					)}
				</button>

				{/* Delete fill */}
				<button
					type="button"
					className="w-5 h-5 border-none bg-transparent text-bv-muted cursor-pointer flex items-center justify-center shrink-0 transition-colors rounded hover:text-bv-orange"
					onClick={state.handleRemoveFill}
					title="Delete fill"
				>
					<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
					</svg>
				</button>
			</div>

			{/* Gradient: bar with handles */}
			{isGradient && (
				<div className="pt-1">
				<GradientBar
					stops={state.stops}
					direction={state.directionCSS}
					onStopDrag={state.handleStopDrag}
					onStopDragEnd={state.handleStopDragEnd}
					onStopClick={state.handleStopClick}
					onBarClick={state.handleBarClick}
					onStopRemove={state.handleStopRemove}
					selectedStopId={state.selectedStopId}
				/>
				</div>
			)}

			{/* Gradient: "Stops" header + stop rows */}
			{isGradient && (
				<div className="space-y-0.5">
					<div className="flex items-center justify-between h-5">
						<span className="text-[10px] font-semibold text-bv-text-mid uppercase tracking-wider">Stops</span>
						<button
							type="button"
							className="w-4 h-4 border-none bg-transparent text-bv-text-mid cursor-pointer flex items-center justify-center shrink-0 transition-colors hover:text-bv-teal rounded"
							onClick={() => state.handleBarClick(50)}
							title="Add stop"
						>
							<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
							</svg>
						</button>
					</div>
					{state.stops.map((stop) => (
						<GradientStopRow
							key={stop.id}
							stop={stop}
							onSwatchClick={state.handleStopClick}
							onRemove={state.handleStopRemove}
							onRemoveHover={state.handleStopRemoveHover}
							onRemoveLeave={state.handleStopRemoveLeave}
							isSelected={stop.id === state.selectedStopId}
						/>
					))}
				</div>
			)}

			{/* Floating color picker */}
			{state.colorPickerOpen && (
				<FloatingPortal>
					<div
						ref={refs.setFloating}
						style={{ ...floatingStyles, zIndex: 9999, overflowY: "auto" }}
						{...getFloatingProps()}
					>
						<ColorGrid
							prefix={state.colorPrefix}
							currentValue={state.colorPickerCurrentValue}
							colors={props.colors}
							locked={false}
							lockedValue={null}
							onHover={state.handleColorHover}
							onLeave={state.handleColorLeave}
							onClick={state.handleColorClick}
							onRemove={
								state.editingTarget === "solid"
									? state.handleRemoveSolid
									: undefined
							}
							onRemoveHover={
								state.editingTarget === "solid"
									? state.handleHoverRemoveSolid
									: undefined
							}
						/>
						{state.selectedStopIsRemovable && (
							<button
								type="button"
								className="mt-1.5 w-full text-[10px] text-bv-orange border border-bv-orange/40 rounded px-2 py-0.5 cursor-pointer hover:bg-bv-orange hover:text-white transition-colors"
								onClick={() => {
									if (state.selectedStopId)
										state.handleStopRemove(state.selectedStopId);
								}}
							>
								Remove stop
							</button>
						)}
					</div>
				</FloatingPortal>
			)}
		</div>
	);
}
