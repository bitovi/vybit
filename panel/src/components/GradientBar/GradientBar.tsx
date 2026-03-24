import { useCallback, useRef } from "react";
import type { GradientBarProps, GradientStop } from "./types";

function buildGradientCSS(stops: GradientStop[], direction: string): string {
	const sorted = [...stops].sort(
		(a, b) => (a.position ?? 0) - (b.position ?? 0),
	);
	const colorStops = sorted.map((s) =>
		s.position != null ? `${s.hex} ${s.position}%` : s.hex,
	);
	return `linear-gradient(${direction}, ${colorStops.join(", ")})`;
}

function snapTo5(value: number): number {
	return Math.round(Math.max(0, Math.min(100, value)) / 5) * 5;
}

interface PillHandleProps {
	stop: GradientStop;
	isSelected: boolean;
	trackHeight: number;
	onDragStart: (stopId: string, startX: number) => void;
	onClick: (stopId: string, anchorEl: Element) => void;
}

function PillHandle({
	stop,
	isSelected,
	trackHeight,
	onDragStart,
	onClick,
}: PillHandleProps) {
	const didDrag = useRef(false);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			didDrag.current = false;
			onDragStart(stop.id, e.clientX);

			const onMove = () => {
				didDrag.current = true;
			};
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[stop.id, onDragStart],
	);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (!didDrag.current) {
				onClick(stop.id, e.currentTarget);
			}
		},
		[stop.id, onClick],
	);

	const pos = stop.position ?? 0;
	const pillW = 12;
	const pillH = trackHeight - 4;

	return (
		<div
			className={`absolute top-1/2 cursor-grab select-none z-10 hover:z-20 ${isSelected ? "z-25" : ""}`}
			style={{
				left: `${pos}%`,
				transform: "translate(-50%, -50%)",
				width: pillW,
				height: pillH,
			}}
			onMouseDown={handleMouseDown}
			onClick={handleClick}
			title={`${stop.role}-${stop.colorName}${stop.position != null ? ` ${stop.position}%` : ""}`}
		>
			<div
				className="w-full h-full rounded-full"
				style={{
					background: stop.hex,
					border: `2px solid ${isSelected ? "#00848B" : "rgba(255,255,255,0.85)"}`,
					boxShadow: "0 0 0 1px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.2)",
				}}
			/>
		</div>
	);
}

export function GradientBar({
	stops,
	direction,
	onStopDrag,
	onStopDragEnd,
	onStopClick,
	onBarClick,
	selectedStopId,
}: GradientBarProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const dragState = useRef<{
		stopId: string;
		startX: number;
		startPos: number;
	} | null>(null);
	const trackHeight = 24;

	const sorted = [...stops].sort(
		(a, b) => (a.position ?? 0) - (b.position ?? 0),
	);

	const handleDragStart = useCallback(
		(stopId: string, startX: number) => {
			const stop = stops.find((s) => s.id === stopId);
			if (!stop) return;
			dragState.current = { stopId, startX, startPos: stop.position ?? 0 };

			const onMove = (e: MouseEvent) => {
				const ds = dragState.current;
				if (!ds || !trackRef.current) return;
				const rect = trackRef.current.getBoundingClientRect();
				const dx = e.clientX - ds.startX;
				const pctDelta = (dx / rect.width) * 100;
				const newPos = snapTo5(ds.startPos + pctDelta);
				onStopDrag(ds.stopId, newPos);
			};

			const onUp = (e: MouseEvent) => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				const ds = dragState.current;
				if (ds && trackRef.current) {
					const rect = trackRef.current.getBoundingClientRect();
					const dx = e.clientX - ds.startX;
					const pctDelta = (dx / rect.width) * 100;
					const finalPos = snapTo5(ds.startPos + pctDelta);
					onStopDragEnd(ds.stopId, finalPos);
				}
				dragState.current = null;
			};

			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[stops, onStopDrag, onStopDragEnd],
	);

	const handleTrackClick = useCallback(
		(e: React.MouseEvent) => {
			if (!trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			const pct = ((e.clientX - rect.left) / rect.width) * 100;
			onBarClick(snapTo5(pct));
		},
		[onBarClick],
	);

	const gradientCSS = buildGradientCSS(sorted, direction);

	return (
		<div
			ref={trackRef}
			className="relative w-full rounded-lg cursor-pointer"
			style={{
				height: trackHeight,
				background: gradientCSS,
				border: "1px solid rgba(255,255,255,0.08)",
			}}
			onClick={handleTrackClick}
		>
			{/* Pill handles — inside the track */}
			{sorted.map((stop) => (
				<PillHandle
					key={stop.id}
					stop={stop}
					isSelected={stop.id === selectedStopId}
					trackHeight={trackHeight}
					onDragStart={handleDragStart}
					onClick={onStopClick}
				/>
			))}
		</div>
	);
}
