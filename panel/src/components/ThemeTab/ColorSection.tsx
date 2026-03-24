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
