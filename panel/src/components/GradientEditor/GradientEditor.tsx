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
import { DirectionPicker } from "../DirectionPicker";
import { GradientBar } from "../GradientBar";
import type { GradientEditorProps } from "./types";
import { useGradientState } from "./useGradientState";

export function GradientEditor(props: GradientEditorProps) {
	const state = useGradientState(props);
	const isSolid = state.mode === "solid";

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
	}, [state.anchorEl]);

	return (
		<div>
			{/* Combo row: direction picker + gradient bar (or solid swatch) */}
			<div className="flex items-start gap-2.5 mb-2">
				<DirectionPicker
					direction={state.direction}
					mode={state.mode}
					onHover={state.handleDirectionHover}
					onLeave={state.handleDirectionLeave}
					onDirectionClick={state.handleDirectionClick}
					onSolidClick={state.handleSolidToggle}
					solidColorName={state.solidColorName}
				/>

				{isSolid ? (
					/* Solid color swatch */
					<div
						className="flex-1 min-w-0 self-stretch rounded-md cursor-pointer relative overflow-hidden"
						style={{
							background: state.solidColorHex ?? "transparent",
							border: "1px solid rgba(255,255,255,0.12)",
							boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
							minHeight: 36,
						}}
						onClick={(e) => state.handleSwatchClick(e.currentTarget)}
						title={
							state.solidColorName
								? `bg-${state.solidColorName}`
								: "Click to pick color"
						}
					>
						{!state.solidColorHex && (
							<svg
								className="absolute inset-0 w-full h-full"
								viewBox="0 0 100 100"
								preserveAspectRatio="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<line
									x1="4"
									y1="4"
									x2="96"
									y2="96"
									stroke="#F5532D"
									strokeWidth="3"
									strokeLinecap="round"
								/>
								<line
									x1="96"
									y1="4"
									x2="4"
									y2="96"
									stroke="#F5532D"
									strokeWidth="3"
									strokeLinecap="round"
								/>
							</svg>
						)}
					</div>
				) : (
					/* Gradient bar with draggable pentagon handles */
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
				)}
			</div>

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

			{/* Hint text */}
			<div className="text-[10px] text-bv-muted italic">
				{isSolid
					? "Click the swatch to change color · Click a direction arrow for gradient"
					: "Click handles to change color · Drag to reposition · Click bar to add stop"}
			</div>
		</div>
	);
}
