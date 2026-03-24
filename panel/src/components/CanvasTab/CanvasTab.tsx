import type { CanvasTabProps } from "./types";

export function CanvasTab({ onOpenCanvas }: CanvasTabProps) {
	return (
		<div className="flex flex-col items-center justify-center h-full gap-3 p-6">
			<p className="text-[11px] text-bv-text-mid text-center">
				Open a full-size canvas to wireframe a new page, component, or
				composition.
			</p>
			<button
				type="button"
				onClick={onOpenCanvas}
				className="px-5 py-2 rounded-md bg-bv-teal text-white text-[12px] font-semibold hover:opacity-90 transition-opacity"
			>
				Open Canvas
			</button>
		</div>
	);
}
