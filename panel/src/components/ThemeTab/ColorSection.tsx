import type React from "react";
import {
	HUE_ORDER,
	SHADE_ORDER,
} from "../../../../overlay/src/tailwind/scales";

interface ColorEdit {
	hue: string;
	shade: string;
	original: string;
	current: string;
}

export type { ColorEdit };

/** Resolve a CSS color value to hex for the native <input type="color"> */
function resolveToHex(value: string): string {
	if (value.startsWith("#")) {
		if (value.length === 4) {
			return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
		}
		return value;
	}
	try {
		const ctx = document.createElement("canvas").getContext("2d");
		if (ctx) {
			ctx.fillStyle = value;
			return ctx.fillStyle;
		}
	} catch {
		/* fall through */
	}
	return "#000000";
}

/** Convert a hex color (#rrggbb) to oklch() for Tailwind v4 @theme blocks */
export function hexToOklch(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;

	// sRGB → linear RGB
	const toLinear = (c: number) =>
		c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	const lr = toLinear(r);
	const lg = toLinear(g);
	const lb = toLinear(b);

	// Linear RGB → CIE XYZ (D65)
	const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
	const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
	const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;

	// XYZ → LMS (using the M1 matrix from OKLab spec)
	const l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
	const m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
	const s_ = 0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z;

	// LMS → LMS' (cube root)
	const l1 = Math.cbrt(l_);
	const m1 = Math.cbrt(m_);
	const s1 = Math.cbrt(s_);

	// LMS' → OKLab
	const L = 0.2104542553 * l1 + 0.7936177850 * m1 - 0.0040720468 * s1;
	const A = 1.9779984951 * l1 - 2.4285922050 * m1 + 0.4505937099 * s1;
	const B = 0.0259040371 * l1 + 0.7827717662 * m1 - 0.8086757660 * s1;

	// OKLab → OKLCH
	const C = Math.sqrt(A * A + B * B);
	let H = (Math.atan2(B, A) * 180) / Math.PI;
	if (H < 0) H += 360;

	// Round to 3 decimal places for readability
	const lRound = Math.round(L * 1000) / 1000;
	const cRound = Math.round(C * 1000) / 1000;
	const hRound = Math.round(H * 1000) / 1000;

	// For achromatic colors (very low chroma), omit hue
	if (cRound < 0.001) {
		return `oklch(${lRound} ${cRound} 0)`;
	}

	return `oklch(${lRound} ${cRound} ${hRound})`;
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Collapsible group header for a hue family */
function HueGroupHeader({
	hue,
	expanded,
	editCount,
	previewColor,
	onToggle,
}: {
	hue: string;
	expanded: boolean;
	editCount: number;
	previewColor: string;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			className="flex items-center gap-2 w-full px-3 py-1.5 bg-transparent border-none cursor-pointer hover:bg-white/4 transition-colors text-left"
			onClick={onToggle}
		>
			<svg
				width="8"
				height="8"
				viewBox="0 0 8 8"
				fill="currentColor"
				className={`text-bv-muted transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
			>
				<title>{expanded ? "Collapse" : "Expand"}</title>
				<path d="M2 0l4 4-4 4z" />
			</svg>
			<div
				className="w-4 h-4 rounded-sm shrink-0 border border-white/10"
				style={{ backgroundColor: previewColor }}
			/>
			<span className="text-[11px] text-bv-text font-medium flex-1">
				{capitalize(hue)}
			</span>
			{editCount > 0 && (
				<span className="text-[9px] text-bv-orange font-medium">
					{editCount} edit{editCount > 1 ? "s" : ""}
				</span>
			)}
			<span className="text-[10px] text-bv-muted">{expanded ? "−" : "+"}</span>
		</button>
	);
}

/** A single shade row: swatch + label + hex input + color picker */
function ShadeRow({
	hue,
	shade,
	value,
	isEdited,
	onColorChange,
	pickerRefs,
}: {
	hue: string;
	shade: string;
	value: string;
	isEdited: boolean;
	onColorChange: (hue: string, shade: string, newValue: string) => void;
	pickerRefs: React.RefObject<Map<string, HTMLInputElement>>;
}) {
	const key = `${hue}.${shade}`;
	const resolvedHex = resolveToHex(value);

	const openPicker = () => {
		const input = pickerRefs.current?.get(key);
		if (input) input.click();
	};

	return (
		<div
			className={`flex items-center gap-2 px-3 pl-8 py-1 hover:bg-white/4 transition-colors group ${
				isEdited ? "bg-bv-orange/5" : ""
			}`}
		>
			<button
				type="button"
				className={`w-6 h-6 rounded shrink-0 border cursor-pointer p-0 transition-all hover:scale-110 ${
					isEdited ? "border-bv-orange" : "border-white/15"
				}`}
				style={{ backgroundColor: value }}
				onClick={openPicker}
				title="Click to pick color"
			/>

			<span className="text-[11px] text-bv-text flex-1 min-w-0 truncate">
				{capitalize(hue)} {shade}
			</span>

			<input
				type="text"
				className={`w-18 px-1.5 py-0.5 text-[10px] font-mono rounded border bg-transparent text-bv-text-mid transition-colors focus:outline-none focus:border-bv-teal focus:text-bv-text ${
					isEdited ? "border-bv-orange text-bv-text" : "border-bv-border"
				}`}
				value={resolvedHex}
				onChange={(e) => {
					const v = e.target.value;
					if (/^#[0-9a-f]{6}$/i.test(v)) {
						onColorChange(hue, shade, v);
					}
				}}
				onBlur={(e) => {
					let v = e.target.value.trim();
					if (!v.startsWith("#")) v = `#${v}`;
					if (/^#[0-9a-f]{6}$/i.test(v)) {
						onColorChange(hue, shade, v);
					}
				}}
			/>

			<input
				ref={(el) => {
					if (el) pickerRefs.current?.set(key, el);
				}}
				type="color"
				className="w-0 h-0 p-0 border-none opacity-0 absolute"
				tabIndex={-1}
				value={resolvedHex}
				onChange={(e) => onColorChange(hue, shade, e.target.value)}
			/>

			{isEdited && (
				<div className="w-1.5 h-1.5 rounded-full bg-bv-orange shrink-0" />
			)}
		</div>
	);
}

/** Hue group — header + expandable shade list */
export function HueGroup({
	hue,
	hueColors,
	edits,
	expanded,
	editCount,
	onToggle,
	onColorChange,
	pickerRefs,
}: {
	hue: string;
	hueColors: Record<string, string>;
	edits: Map<string, ColorEdit>;
	expanded: boolean;
	editCount: number;
	onToggle: () => void;
	onColorChange: (hue: string, shade: string, newValue: string) => void;
	pickerRefs: React.RefObject<Map<string, HTMLInputElement>>;
}) {
	const previewColor =
		edits.get(`${hue}.500`)?.current ??
		hueColors["500"] ??
		hueColors["400"] ??
		"#888";

	return (
		<div className="border-b border-bv-border/50">
			<HueGroupHeader
				hue={hue}
				expanded={expanded}
				editCount={editCount}
				previewColor={previewColor}
				onToggle={onToggle}
			/>
			{expanded && (
				<div className="pb-1">
					{SHADE_ORDER.map((shade) => {
						if (hueColors[shade] === undefined) return null;
						const key = `${hue}.${shade}`;
						const isEdited = edits.has(key);
						const value = isEdited
							? (edits.get(key)?.current ?? hueColors[shade])
							: hueColors[shade];
						return (
							<ShadeRow
								key={shade}
								hue={hue}
								shade={shade}
								value={value}
								isEdited={isEdited}
								onColorChange={onColorChange}
								pickerRefs={pickerRefs}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

/** Renders any color groups not in HUE_ORDER */
export function CustomColorGroups({
	colors,
	edits,
	expandedHues,
	onToggle,
	onColorChange,
	pickerRefs,
}: {
	colors: Record<string, unknown>;
	edits: Map<string, ColorEdit>;
	expandedHues: Set<string>;
	onToggle: (hue: string) => void;
	onColorChange: (hue: string, shade: string, newValue: string) => void;
	pickerRefs: React.RefObject<Map<string, HTMLInputElement>>;
}) {
	const hueSet = new Set(HUE_ORDER as readonly string[]);
	const specialSet = new Set([
		"black",
		"white",
		"transparent",
		"inherit",
		"current",
		"currentColor",
	]);
	const custom = Object.entries(colors).filter(
		([key, val]) =>
			!hueSet.has(key) &&
			!specialSet.has(key) &&
			typeof val === "object" &&
			val !== null,
	);
	if (custom.length === 0) return null;

	return (
		<>
			{custom.map(([hue, shades]) => {
				const shadeObj = shades as Record<string, string>;
				const expanded = expandedHues.has(hue);
				const shadeKeys = Object.keys(shadeObj).filter(
					(k) => typeof shadeObj[k] === "string",
				);
				const editCount = shadeKeys.filter((s) =>
					edits.has(`${hue}.${s}`),
				).length;
				const previewShade =
					shadeObj["500"] ??
					shadeObj[shadeKeys[Math.floor(shadeKeys.length / 2)]] ??
					"#888";

				return (
					<div key={hue} className="border-b border-bv-border/50">
						<HueGroupHeader
							hue={hue}
							expanded={expanded}
							editCount={editCount}
							previewColor={previewShade}
							onToggle={() => onToggle(hue)}
						/>
						{expanded && (
							<div className="pb-1">
								{shadeKeys.map((shade) => {
									const key = `${hue}.${shade}`;
									const isEdited = edits.has(key);
									const value = isEdited
										? (edits.get(key)?.current ?? shadeObj[shade])
										: shadeObj[shade];
									return (
										<ShadeRow
											key={shade}
											hue={hue}
											shade={shade}
											value={value}
											isEdited={isEdited}
											onColorChange={onColorChange}
											pickerRefs={pickerRefs}
										/>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}
