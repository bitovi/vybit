import type { BackgroundMode, GradientDirection } from "../DirectionPicker";
import type { GradientStop } from "../GradientBar";

export type FillType = "solid" | "linear";

export interface GradientEditorProps {
	/** Initial gradient direction, e.g. 'r' */
	direction: GradientDirection;
	/** Initial stops (parsed from classes) */
	stops: GradientStop[];
	/** Initial mode */
	mode: BackgroundMode;
	/** Initial solid color (Tailwind name), e.g. 'blue-500' */
	solidColorName: string | null;
	/** Resolved hex for the solid color */
	solidColorHex: string | null;
	/** Full Tailwind color palette: Record<string, Record<string, string>> */
	colors: Record<string, any>;
	/** Called to preview a class change (hover) */
	onPreview: (oldClass: string, newClass: string) => void;
	/** Called to preview multiple class changes atomically (hover on mode transition) */
	onPreviewBatch: (
		pairs: Array<{ oldClass: string; newClass: string }>,
	) => void;
	/** Called to revert an active preview */
	onRevert: () => void;
	/** Called to stage (commit) a class change */
	onStage: (oldClass: string, newClass: string) => void;
}

export const DIR_TO_CSS: Record<GradientDirection, string> = {
	t: "to top",
	tr: "to top right",
	r: "to right",
	br: "to bottom right",
	b: "to bottom",
	bl: "to bottom left",
	l: "to left",
	tl: "to top left",
};

export const DIR_LABELS: Record<
	GradientDirection,
	{ arrow: string; label: string }
> = {
	t: { arrow: "↑", label: "to top" },
	tr: { arrow: "↗", label: "to top right" },
	r: { arrow: "→", label: "to right" },
	br: { arrow: "↘", label: "to bottom right" },
	b: { arrow: "↓", label: "to bottom" },
	bl: { arrow: "↙", label: "to bottom left" },
	l: { arrow: "←", label: "to left" },
	tl: { arrow: "↖", label: "to top left" },
};

export const DIRECTION_ORDER: GradientDirection[] = [
	"r",
	"br",
	"b",
	"bl",
	"l",
	"tl",
	"t",
	"tr",
];
