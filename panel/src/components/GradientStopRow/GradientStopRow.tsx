import { useRef, useState } from "react";
import type { GradientStopRowProps } from "./types";

const ROLE_LABELS: Record<string, string> = {
	from: "from",
	via: "via",
	to: "to",
};

export function GradientStopRow({
	stop,
	onSwatchClick,
	onRemove,
	onRemoveHover,
	onRemoveLeave,
	isSelected,
}: GradientStopRowProps) {
	const [hovered, setHovered] = useState(false);
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

	const canRemove = stop.role === "via";
	const posLabel = stop.position != null ? `${stop.position}%` : ROLE_LABELS[stop.role] ?? stop.role;

	return (
		<div
			className={`flex items-center gap-1.5 h-7 px-1 rounded transition-colors ${
				isSelected ? "bg-bv-teal/10" : "hover:bg-[rgba(255,255,255,0.03)]"
			}`}
			{...cellHoverProps}
		>
			{/* Position / role label */}
			<span className="text-[10px] font-mono text-bv-muted w-8 shrink-0 text-right tabular-nums">
				{posLabel}
			</span>

			{/* Color swatch */}
			<button
				type="button"
				className="w-4.5 h-4.5 rounded-[3px] border border-[rgba(255,255,255,0.15)] shrink-0 cursor-pointer p-0 bg-transparent"
				style={{ background: stop.hex }}
				onClick={(e) => onSwatchClick(stop.id, e.currentTarget)}
				title={`${stop.role}-${stop.colorName}`}
			/>

			{/* Color name — click to open color picker */}
			<button
				type="button"
				className="flex-1 min-w-0 text-[11px] font-mono text-bv-text-mid truncate text-left border-none bg-transparent cursor-pointer px-0.5 hover:text-bv-teal transition-colors"
				onClick={(e) => onSwatchClick(stop.id, e.currentTarget)}
			>
				{stop.colorName}
			</button>

			{/* Remove button (via stops only) */}
			{canRemove ? (
				<button
					type="button"
					className={`w-4 h-4 rounded border-none bg-transparent text-bv-muted cursor-pointer flex items-center justify-center shrink-0 transition-all hover:text-bv-orange ${
						hovered ? "opacity-100" : "opacity-0"
					}`}
					onMouseEnter={() => {
						clearTimeout(hideTimer.current);
						setHovered(true);
						onRemoveHover(stop.id);
					}}
					onMouseLeave={() => {
						hideTimer.current = setTimeout(() => setHovered(false), 60);
						onRemoveLeave();
					}}
					onClick={() => onRemove(stop.id)}
					title="Remove stop"
				>
					<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
					</svg>
				</button>
			) : (
				<span className="w-4 shrink-0" />
			)}
		</div>
	);
}
