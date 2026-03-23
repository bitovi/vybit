import { Fragment } from "react";
import { ShadowLayerRow } from "./ShadowLayerRow";
import type {
	ShadowEditorProps,
	ShadowLayerState,
	ShadowLayerType,
} from "./types";
import { LAYER_DEFAULTS, LAYER_LABELS } from "./types";

const ALL_LAYER_TYPES: ShadowLayerType[] = [
	"shadow",
	"inset-shadow",
	"ring",
	"inset-ring",
	"text-shadow",
];

export function ShadowEditor({
	layers,
	onPreview,
	onRevert,
	onStage,
	onAdd,
	onRemove,
	onRemoveHover,
	onColorClick,
}: ShadowEditorProps) {
	function allClassesForLayer(layer: ShadowLayerState): string[] {
		const classes: string[] = [];
		if (layer.sizeClass) classes.push(layer.sizeClass);
		if (layer.colorClass) {
			classes.push(
				layer.opacity !== null
					? `${layer.colorClass}/${layer.opacity}`
					: layer.colorClass,
			);
		}
		return classes;
	}

	const items = ALL_LAYER_TYPES.map((type) => ({
		type,
		layer: layers.find((l) => l.type === type),
	}));

	return (
		/**
		 * 6-column shared grid — every row (active + ghost) places cells directly here.
		 * Col 1: dot (●) or [+] button    — 16px fixed
		 * Col 2: layer name               — auto (widest = "Inset Shadow" sets all)
		 * Col 3: size scrubber            — 1fr
		 * Col 4: color + opacity (Figma)  — 1fr
		 * Col 5: preview square           — 26px
		 * Col 6: × remove button          — 18px
		 */
		<div
			className="grid items-center gap-x-1.5 gap-y-1 w-full"
			style={{ gridTemplateColumns: "16px auto 1fr 1fr 26px 18px" }}
		>
			{items.map(({ type, layer }, idx) => (
				<Fragment key={type}>
					{/* Horizontal rule between rows */}
					{idx > 0 && (
						<div
							className="h-px bg-bv-border opacity-50"
							style={{ gridColumn: "1 / -1" }}
						/>
					)}

					{layer ? (
						<ShadowLayerRow
							layer={layer}
							onSizeHover={(value) => onPreview(layer.sizeClass ?? "", value)}
							onSizeLeave={onRevert}
							onSizeClick={(value) => onStage(layer.sizeClass ?? "", value)}
							onColorClick={(anchorEl) => onColorClick?.(layer, anchorEl)}
							onOpacityHover={(value) => {
								if (!layer.colorClass) return;
								const base = layer.colorClass.split("/")[0];
								const pct = parseInt(value);
								const newClass = pct === 100 ? base : `${base}/${pct}`;
								const oldClass =
									layer.opacity !== null ? `${base}/${layer.opacity}` : base;
								onPreview(oldClass, newClass);
							}}
							onOpacityLeave={onRevert}
							onOpacityClick={(value) => {
								if (!layer.colorClass) return;
								const base = layer.colorClass.split("/")[0];
								const pct = parseInt(value);
								const newClass = pct === 100 ? base : `${base}/${pct}`;
								const oldClass =
									layer.opacity !== null ? `${base}/${layer.opacity}` : base;
								onStage(oldClass, newClass);
							}}
							onRemove={() => onRemove(allClassesForLayer(layer))}
							onRemoveHover={() => onRemoveHover(allClassesForLayer(layer))}
						/>
					) : (
						/* Ghost row: col 1=[+], col 2=name */
						<>
							{/* Col 1: + button */}
							<button
								type="button"
								className="w-4 h-4 rounded-[3px] border border-dashed border-bv-border bg-transparent text-bv-muted text-[11px] cursor-pointer flex items-center justify-center transition-all hover:border-bv-teal hover:border-solid hover:text-bv-teal hover:bg-bv-teal/10"
								onClick={() => onAdd(LAYER_DEFAULTS[type])}
								title={`Add ${LAYER_DEFAULTS[type]}`}
							>
								+
							</button>
							{/* Col 2: name */}
							<div className="flex items-center leading-none text-[9px] font-mono uppercase tracking-[0.6px] text-bv-muted whitespace-nowrap">
								{LAYER_LABELS[type]}
							</div>
						</>
					)}
				</Fragment>
			))}
		</div>
	);
}
