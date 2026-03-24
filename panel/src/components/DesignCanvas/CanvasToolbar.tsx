import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DrawingTool } from "./types";
import { BASIC_COLORS } from "./types";

const CursorIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<path d="M15.707,11.293l-3.928-3.928l3.592-1.437c0.397-0.159,0.649-0.553,0.628-0.98 c-0.022-0.427-0.313-0.793-0.725-0.91l-14-4C0.929-0.061,0.55,0.036,0.293,0.293C0.036,0.55-0.062,0.925,0.038,1.275l4,14 c0.118,0.411,0.483,0.702,0.911,0.724C4.966,16,4.983,16,5,16c0.407,0,0.776-0.248,0.929-0.628l1.437-3.592l3.928,3.928 c0.391,0.391,1.023,0.391,1.414,0l3-3C16.098,12.316,16.098,11.684,15.707,11.293z M12,13.586L7.707,9.293C7.518,9.104,7.263,9,7,9 C6.934,9,6.866,9.007,6.799,9.021C6.47,9.088,6.196,9.316,6.071,9.628l-0.913,2.284L2.456,2.456l9.457,2.702L9.629,6.071 C9.316,6.196,9.088,6.47,9.021,6.799c-0.067,0.33,0.035,0.67,0.272,0.908L13.586,12L12,13.586z" />
	</svg>
);

const PenIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<path d="M15.7,5.3l-5-5C10.5,0,10.1-0.1,9.7,0l-7,2C2.4,2.1,2.1,2.5,2,2.8L0.1,14.5l6-6c-0.2-0.7,0-1.4,0.5-1.9 c0.8-0.8,2-0.8,2.8,0c0.8,0.8,0.8,2,0,2.8c-0.5,0.5-1.3,0.7-1.9,0.5l-6,6L13.2,14c0.4-0.1,0.7-0.3,0.8-0.7l2-7 C16.1,5.9,16,5.5,15.7,5.3z" />
	</svg>
);

const RectangleIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
		<rect x="0.5" y="0.5" width="15" height="15" rx="1" ry="1" />
	</svg>
);

const CircleIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<path d="M8,16c-1.199,0-2.352-0.259-3.428-0.77l0.857-1.807C6.235,13.806,7.1,14,8,14c3.309,0,6-2.691,6-6 s-2.691-6-6-6S2,4.691,2,8c0,0.901,0.194,1.766,0.578,2.572l-1.806,0.859C0.26,10.354,0,9.2,0,8c0-4.411,3.589-8,8-8s8,3.589,8,8 S12.411,16,8,16z" />
	</svg>
);

const LineIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<rect x="-1.485" y="7" width="18.97" height="2" transform="translate(-3.314 8) rotate(-45)" />
	</svg>
);

const ArrowIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<path d="M15.854.146A.5.5,0,0,0,15.32.033l-6.5,2.5a.5.5,0,0,0-.174.821L9.939,4.646.293,14.293a1,1,0,1,0,1.414,1.414l9.647-9.646,1.292,1.293A.5.5,0,0,0,13,7.5a.46.46,0,0,0,.1-.011.5.5,0,0,0,.363-.309l2.5-6.5A.5.5,0,0,0,15.854.146Z" />
	</svg>
);

const EraserIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<rect y="14" width="16" height="2" />
		<path d="M4.6,12h4.8l5.3-5.3c0.4-0.4,0.4-1,0-1.4l-5-5c-0.4-0.4-1-0.4-1.4,0l-7,7c-0.4,0.4-0.4,1,0,1.4L4.6,12z" />
	</svg>
);

const FillIcon = () => (
	<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-bv-text-mid">
		<path d="M15.6,7.3c0,0-4.9-6.7-4.9-6.7c-0.4-0.4-1.3-0.9-3-0.2c-1,0.4-2.1,1.2-3.1,2.2c-1.9,1.9-3.4,4.7-2,6.1 c0,0,6.7,4.9,6.7,4.9c0.3,0.3,0.7,0.4,1.1,0.4c1.1,0,2.5-0.9,3.6-2c0.7-0.7,1.3-1.5,1.7-2.3C16.3,8.4,15.9,7.6,15.6,7.3z M6,4 c1.5-1.5,2.8-2,3.2-2c0,0,0,0,0,0c0,0.4-0.5,1.7-2,3.2c-1.5,1.5-2.8,2-3.2,2c0,0,0,0,0,0C4.1,6.7,4.5,5.4,6,4z" />
		<path d="M0,14c0-1.1,2-4,2-4s2,2.9,2,4s-0.9,2-2,2S0,15.1,0,14z" />
	</svg>
);

const StrokeIcon = () => (
	<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-bv-text-mid">
		<polygon points="11,1 11,2 5,2 5,1 1,1 1,5 2,5 2,11 4,11 4,5 5,5 5,4 11,4 11,5 12,5 12,11 14,11 14,5 15,5 15,1" />
		<polygon points="11,12 5,12 5,11 1,11 1,15 5,15 5,14 11,14 11,15 15,15 15,11 11,11" />
	</svg>
);

const UndoIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<path d="M10,1H3A1,1,0,0,0,3,3h7a3,3,0,0,1,0,6H4.414L6.707,6.707A1,1,0,0,0,5.293,5.293l-4,4a1,1,0,0,0,0,1.414l4,4a1,1,0,1,0,1.414-1.414L4.414,11H10A5,5,0,0,0,10,1Z" />
	</svg>
);

const RedoIcon = () => (
	<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
		<path d="M10.707,5.293A1,1,0,0,0,9.293,6.707L11.586,9H6A3,3,0,0,1,6,3h7a1,1,0,0,0,0-2H6A5,5,0,0,0,6,11h5.586L9.293,13.293a1,1,0,1,0,1.414,1.414l4-4a1,1,0,0,0,0-1.414Z" />
	</svg>
);

const TrashIcon = () => (
	<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
		<rect x="5" y="7" width="2" height="6" rx="0.5" />
		<rect x="9" y="7" width="2" height="6" rx="0.5" />
		<path d="M15,3H11V1a1,1,0,0,0-1-1H6A1,1,0,0,0,5,1V3H1A1,1,0,0,0,1,5H15a1,1,0,0,0,0-2ZM7,2H9V3H7Z" />
		<path d="M13,14H3V6H1v8a2,2,0,0,0,2,2H13a2,2,0,0,0,2-2V6H13Z" />
	</svg>
);

interface CanvasToolbarProps {
	activeTool: DrawingTool;
	onToolChange: (tool: DrawingTool) => void;
	fillColor: string;
	onFillChange: (color: string) => void;
	strokeColor: string;
	onStrokeChange: (color: string) => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	onClear: () => void;
	onSubmit?: () => void;
	onClose?: () => void;
	hideActions?: boolean;
}

const TOOLS: { id: DrawingTool; label: string; icon: ReactNode }[] = [
	{ id: "select", label: "Select", icon: <CursorIcon /> },
	{ id: "freehand", label: "Freehand", icon: <PenIcon /> },
	{ id: "rectangle", label: "Rectangle", icon: <RectangleIcon /> },
	{ id: "circle", label: "Circle", icon: <CircleIcon /> },
	{ id: "line", label: "Line", icon: <LineIcon /> },
	{ id: "arrow", label: "Arrow", icon: <ArrowIcon /> },
	{ id: "text", label: "Text", icon: "T" },
	{ id: "eraser", label: "Eraser", icon: <EraserIcon /> },
];

export function CanvasToolbar({
	activeTool,
	onToolChange,
	fillColor,
	onFillChange,
	strokeColor,
	onStrokeChange,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onClear,
	onSubmit,
	onClose,
	hideActions,
}: CanvasToolbarProps) {
	const [showFillPalette, setShowFillPalette] = useState(false);
	const [showStrokePalette, setShowStrokePalette] = useState(false);
	const fillRef = useRef<HTMLDivElement>(null);
	const strokeRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				showFillPalette &&
				fillRef.current &&
				!fillRef.current.contains(e.target as Node)
			) {
				setShowFillPalette(false);
			}
			if (
				showStrokePalette &&
				strokeRef.current &&
				!strokeRef.current.contains(e.target as Node)
			) {
				setShowStrokePalette(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showFillPalette, showStrokePalette]);

	return (
		<div className="flex items-center gap-0.5 px-1.5 py-1 bg-bv-bg border-b border-bv-border text-[10px] shrink-0 flex-wrap">
			{TOOLS.map((tool) => (
				<button
					key={tool.id}
					title={tool.label}
					onClick={() => onToolChange(tool.id)}
					className={`w-7 h-[26px] rounded border flex items-center justify-center text-[13px] cursor-pointer transition-all
            ${
							activeTool === tool.id
								? "bg-bv-teal/10 border-bv-teal text-bv-teal"
								: "bg-transparent border-transparent text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text"
						}`}
				>
					{tool.icon}
				</button>
			))}

			<div className="w-px h-[18px] bg-bv-border mx-1" />

			{/* Fill color */}
			<div ref={fillRef} className="relative">
				<button
					title="Fill color"
					className="w-7 h-[26px] rounded border border-transparent flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all hover:bg-bv-surface hover:border-bv-border"
					onClick={() => {
						setShowFillPalette(!showFillPalette);
						setShowStrokePalette(false);
					}}
				>
					<FillIcon />
					<div
						className="w-3 h-0.75 rounded-sm"
						style={{
							background: fillColor === "transparent" ? "repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50%/4px 4px" : fillColor,
						}}
					/>
				</button>
				{showFillPalette && (
					<div className="absolute top-full left-0 mt-1 z-50 bg-bv-bg border border-bv-border rounded-lg shadow-lg p-2 w-[164px]">
						<div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1.5">
							Fill Color
						</div>
						<div className="grid grid-cols-6 gap-1 mb-2">
							{BASIC_COLORS.map((c) => (
								<button
									key={c}
									className={`w-[22px] h-[22px] rounded cursor-pointer transition-all hover:scale-110
                    ${fillColor === c ? "ring-2 ring-bv-teal ring-offset-1" : "border border-black/10"}`}
									style={{ background: c }}
									onClick={() => {
										onFillChange(c);
										setShowFillPalette(false);
									}}
								/>
							))}
						</div>
						<div className="pt-1 border-t border-bv-border flex items-center gap-1.5">
							<button
								className={`w-[22px] h-[22px] rounded cursor-pointer border border-bv-border
                  ${fillColor === "transparent" ? "ring-2 ring-bv-teal ring-offset-1" : ""}`}
								style={{
									background:
										"repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50%/8px 8px",
								}}
								onClick={() => {
									onFillChange("transparent");
									setShowFillPalette(false);
								}}
							/>
							<span className="text-[9px] text-bv-muted">None</span>
						</div>
					</div>
				)}
			</div>

			{/* Stroke color */}
			<div ref={strokeRef} className="relative">
				<button
					title="Stroke color"
					className="w-7 h-[26px] rounded border border-transparent flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all hover:bg-bv-surface hover:border-bv-border"
					onClick={() => {
						setShowStrokePalette(!showStrokePalette);
						setShowFillPalette(false);
					}}
				>
					<StrokeIcon />
					<div
						className="w-3 h-0.75 rounded-sm"
						style={{ background: strokeColor }}
					/>
				</button>
				{showStrokePalette && (
					<div className="absolute top-full left-0 mt-1 z-50 bg-bv-bg border border-bv-border rounded-lg shadow-lg p-2 w-[164px]">
						<div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1.5">
							Stroke Color
						</div>
						<div className="grid grid-cols-6 gap-1">
							{BASIC_COLORS.map((c) => (
								<button
									key={c}
									className={`w-[22px] h-[22px] rounded cursor-pointer transition-all hover:scale-110
                    ${strokeColor === c ? "ring-2 ring-bv-teal ring-offset-1" : "border border-black/10"}`}
									style={{ background: c }}
									onClick={() => {
										onStrokeChange(c);
										setShowStrokePalette(false);
									}}
								/>
							))}
						</div>
					</div>
				)}
			</div>

			<div className="w-px h-[18px] bg-bv-border mx-1" />

			{/* Undo/Redo/Clear */}
			<button
				title="Undo"
				onClick={onUndo}
				disabled={!canUndo}
				className={`w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer transition-all
          ${!canUndo ? "opacity-35 cursor-default" : "text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text"}`}
			>
				<UndoIcon />
			</button>
			<button
				title="Redo"
				onClick={onRedo}
				disabled={!canRedo}
				className={`w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer transition-all
          ${!canRedo ? "opacity-35 cursor-default" : "text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text"}`}
			>
				<RedoIcon />
			</button>
			<button
				title="Clear canvas"
				onClick={onClear}
				className="w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text transition-all"
			>
				<TrashIcon />
			</button>

			{!hideActions && onClose && (
				<button
					onClick={onClose}
					className="ml-auto px-2.5 py-0.5 rounded border border-bv-border bg-bv-bg text-bv-muted text-[10px] font-medium cursor-pointer hover:bg-bv-orange/10 hover:border-bv-orange hover:text-bv-orange transition-all"
				>
					✕ Close
				</button>
			)}
			{!hideActions && onSubmit && (
				<button
					onClick={onSubmit}
					className="px-2.5 py-0.5 rounded border border-bv-teal bg-bv-teal text-white text-[10px] font-medium cursor-pointer hover:bg-bv-teal/80 transition-all"
				>
					✓ Add to Drafts
				</button>
			)}
		</div>
	);
}
