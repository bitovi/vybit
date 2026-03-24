// Tailwind v4 adapter — uses compile() / build() from the target project's tailwindcss v4.

import { existsSync, readdirSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { pathToFileURL } from "url";
import {
	extractShadowDefaults,
	SHADOW_PROBE_CLASSES,
} from "./shadow-defaults.js";
import type {
	TailwindAdapter,
	TailwindThemeSubset,
} from "./tailwind-adapter.js";

// Cached compiler instance (from target project's tailwindcss)
let compilerCache: { build: (classes: string[]) => string } | null = null;

/**
 * Get a Tailwind v4 compile() function from the target project's node_modules.
 */
async function getCompile(): Promise<
	(css: string, opts: any) => Promise<{ build: (classes: string[]) => string }>
> {
	const cwd = process.cwd();
	const req = createRequire(resolve(cwd, "package.json"));
	const tw = await import(pathToFileURL(req.resolve("tailwindcss")).href);
	// Handle CJS/ESM interop: compile may be on tw directly or on tw.default
	const mod = tw.default ?? tw;
	const compile = mod.compile ?? mod.default?.compile;
	if (typeof compile !== "function") {
		throw new Error("Could not find compile() in target project's tailwindcss");
	}
	return compile;
}

/**
 * loadStylesheet callback for Tailwind v4 compile().
 * Resolves @import "tailwindcss" and other stylesheet imports from the target project.
 */
function makeLoadStylesheet(cwd: string) {
	const req = createRequire(resolve(cwd, "package.json"));
	return async (id: string, base: string) => {
		let resolved: string;
		if (id === "tailwindcss") {
			resolved = req.resolve("tailwindcss/index.css");
		} else {
			// Try resolving from node_modules first, then as a file path
			try {
				resolved = req.resolve(id, { paths: [base || cwd] });
			} catch {
				// If module resolution fails, try as a direct file path
				const candidate = resolve(base || cwd, id);
				if (existsSync(candidate)) {
					resolved = candidate;
				} else {
					throw new Error(
						`Cannot resolve stylesheet: ${id} from ${base || cwd}`,
					);
				}
			}
		}
		return {
			content: readFileSync(resolved, "utf8"),
			base: dirname(resolved),
		};
	};
}

/**
 * Find the project's CSS entry point that contains Tailwind directives.
 * Looks for common CSS files that include @import "tailwindcss" or @theme blocks.
 */
function findProjectCssEntry(cwd: string): string | null {
	const candidates = [
		"src/index.css",
		"src/app.css",
		"src/globals.css",
		"src/global.css",
		"src/styles.css",
		"src/style.css",
		"src/main.css",
		"app/globals.css",
		"app/global.css",
		"styles/globals.css",
		"styles/global.css",
	];

	for (const candidate of candidates) {
		const fullPath = join(cwd, candidate);
		if (existsSync(fullPath)) {
			const content = readFileSync(fullPath, "utf8");
			// Check if it imports tailwindcss (v4 style) or has @theme blocks
			if (content.includes("tailwindcss") || content.includes("@theme")) {
				return fullPath;
			}
		}
	}

	// Fallback: scan src/ for any .css file that imports tailwindcss
	const srcDir = join(cwd, "src");
	if (existsSync(srcDir)) {
		try {
			const files = readdirSync(srcDir).filter((f) => f.endsWith(".css"));
			for (const file of files) {
				const fullPath = join(srcDir, file);
				const content = readFileSync(fullPath, "utf8");
				if (content.includes("tailwindcss") || content.includes("@theme")) {
					return fullPath;
				}
			}
		} catch {
			/* ignore read errors */
		}
	}

	return null;
}

/**
 * Initialize the Tailwind v4 compiler for the target project.
 * Tries to use the project's actual CSS entry point (which may contain @theme blocks
 * with custom colors) instead of bare @import "tailwindcss".
 */
async function getCompiler(): Promise<{
	build: (classes: string[]) => string;
}> {
	if (compilerCache) return compilerCache;

	const cwd = process.cwd();
	const compile = await getCompile();

	// Try to use the project's CSS entry point for custom theme support
	const cssEntryPath = findProjectCssEntry(cwd);
	let inputCss: string;
	let base: string;

	if (cssEntryPath) {
		inputCss = readFileSync(cssEntryPath, "utf8");
		base = dirname(cssEntryPath);
	} else {
		inputCss = '@import "tailwindcss";';
		base = cwd;
	}

	const result = await compile(inputCss, {
		loadStylesheet: makeLoadStylesheet(cwd),
		base,
	});

	compilerCache = result;
	return result;
}

// Classes we probe to extract theme values
const HUES = [
	"slate",
	"gray",
	"zinc",
	"neutral",
	"stone",
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
];
const SHADES = [
	"50",
	"100",
	"200",
	"300",
	"400",
	"500",
	"600",
	"700",
	"800",
	"900",
	"950",
];
const SPECIAL_COLORS = ["black", "white", "transparent"];

const SPACING_KEYS = [
	"0",
	"px",
	"0.5",
	"1",
	"1.5",
	"2",
	"2.5",
	"3",
	"3.5",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"11",
	"12",
	"14",
	"16",
	"20",
	"24",
	"28",
	"32",
	"36",
	"40",
	"44",
	"48",
	"52",
	"56",
	"60",
	"64",
	"72",
	"80",
	"96",
];

const FONT_SIZE_KEYS = [
	"xs",
	"sm",
	"base",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"4xl",
	"5xl",
	"6xl",
	"7xl",
	"8xl",
	"9xl",
];
const FONT_WEIGHT_KEYS = [
	"thin",
	"extralight",
	"light",
	"normal",
	"medium",
	"semibold",
	"bold",
	"extrabold",
	"black",
];
const BORDER_RADIUS_KEYS = [
	"none",
	"sm",
	"",
	"md",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"full",
];

/**
 * Extract --var definitions from compiled CSS output.
 */
function extractVars(css: string, prefix: string): Map<string, string> {
	const vars = new Map<string, string>();
	const regex = new RegExp(`^\\s*--${prefix}-([\\w.-]+):\\s*([^;]+);`, "gm");
	let match;
	while ((match = regex.exec(css)) !== null) {
		vars.set(match[1], match[2].trim());
	}
	return vars;
}

export class TailwindV4Adapter implements TailwindAdapter {
	readonly version = 4 as const;

	async resolveTailwindConfig(): Promise<TailwindThemeSubset> {
		const compiler = await getCompiler();

		// Probe color classes to extract theme variable definitions
		const probeClasses: string[] = [];
		for (const h of HUES) {
			for (const s of SHADES) probeClasses.push(`bg-${h}-${s}`);
		}
		for (const s of SPECIAL_COLORS) probeClasses.push(`bg-${s}`);

		const css = compiler.build(probeClasses);

		// --- Colors (extracted from CSS custom properties) ---
		// In v4, --color-* vars are emitted in the base layer for all theme colors,
		// including custom ones from @theme blocks.
		const colorVars = extractVars(css, "color");

		// Also try building with zero classes to get just the theme layer vars
		// (some custom colors may only appear in the theme layer, not triggered by probes)
		const baseCss = compiler.build([]);
		const baseColorVars = extractVars(baseCss, "color");
		// Merge base vars into colorVars (base vars are the ground truth)
		for (const [name, value] of baseColorVars) {
			if (!colorVars.has(name)) {
				colorVars.set(name, value);
			}
		}

		const colors: Record<string, unknown> = {};
		for (const [name, value] of colorVars) {
			const dashIdx = name.lastIndexOf("-");
			if (dashIdx > 0) {
				const hue = name.substring(0, dashIdx);
				const shade = name.substring(dashIdx + 1);
				if (/^\d+$/.test(shade)) {
					if (!colors[hue]) colors[hue] = {};
					(colors[hue] as Record<string, string>)[shade] = value;
					continue;
				}
			}
			colors[name] = value;
		}
		if (!colors["transparent"]) colors["transparent"] = "transparent";

		// --- Spacing (v4 uses calc(var(--spacing) * N)) ---
		const spacing: Record<string, string> = {};
		for (const k of SPACING_KEYS) {
			spacing[k] =
				k === "px" ? "1px" : k === "0" ? "0px" : `calc(var(--spacing) * ${k})`;
		}

		// --- Font size, weight, border radius (static scales in v4) ---
		const fontSize: Record<string, unknown> = {};
		for (const k of FONT_SIZE_KEYS) fontSize[k] = k;

		const fontWeight: Record<string, unknown> = {};
		for (const k of FONT_WEIGHT_KEYS) fontWeight[k] = k;

		const borderRadius: Record<string, string> = {};
		for (const k of BORDER_RADIUS_KEYS)
			borderRadius[k || "DEFAULT"] = k || "DEFAULT";

		// --- Shadow/ring defaults (probe compiled CSS for fallback colors) ---
		const shadowCss = compiler.build(SHADOW_PROBE_CLASSES);
		const shadowDefaults = extractShadowDefaults(shadowCss);

		const result: TailwindThemeSubset = {
			tailwindVersion: 4,
			spacing,
			colors,
			fontSize,
			fontWeight,
			borderRadius,
			shadowDefaults,
		};
		console.error("[tailwind] v4 resolved theme:", {
			colors: Object.keys(colors).length + " entries",
			spacing: Object.keys(spacing).length + " entries",
			shadowDefaults,
		});
		return result;
	}

	async generateCssForClasses(classes: string[]): Promise<string> {
		const compiler = await getCompiler();
		const css = compiler.build(classes);
		return css;
	}
}
