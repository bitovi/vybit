import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradientStop } from "../GradientBar";
import { GradientEditor } from "./GradientEditor";
import type { GradientEditorProps } from "./types";

const MOCK_COLORS: Record<string, any> = {
	black: "#000000",
	white: "#FFFFFF",
	indigo: { 500: "#6366F1", 700: "#4338CA" },
	purple: { 500: "#A855F7" },
	pink: { 500: "#EC4899" },
	blue: { 500: "#3B82F6" },
	red: { 500: "#EF4444" },
};

const threeStops: GradientStop[] = [
	{
		id: "1",
		role: "from",
		colorName: "indigo-500",
		hex: "#6366F1",
		position: 5,
	},
	{
		id: "2",
		role: "via",
		colorName: "purple-500",
		hex: "#A855F7",
		position: 50,
	},
	{ id: "3", role: "to", colorName: "pink-500", hex: "#EC4899", position: 95 },
];

function makeProps(
	overrides: Partial<GradientEditorProps> = {},
): GradientEditorProps {
	return {
		direction: "r",
		stops: threeStops,
		mode: "gradient",
		solidColorName: null,
		solidColorHex: null,
		colors: MOCK_COLORS,
		onPreview: vi.fn(),
		onPreviewBatch: vi.fn(),
		onRevert: vi.fn(),
		onStage: vi.fn(),
		...overrides,
	};
}

describe("GradientEditor", () => {
	it("renders type label and gradient bar in gradient mode", () => {
		render(<GradientEditor {...makeProps()} />);
		// Type label showing "Linear"
		expect(screen.getByText("Linear")).toBeTruthy();
		// Direction dropdown button showing "to right"
		expect(screen.getByText("to right")).toBeTruthy();
		// Stop rows show position percentages
		expect(screen.getByText("5%")).toBeTruthy();
		expect(screen.getByText("50%")).toBeTruthy();
		expect(screen.getByText("95%")).toBeTruthy();
		// "Stops" section header
		expect(screen.getByText("Stops")).toBeTruthy();
	});

	it("renders solid fill row in solid mode", () => {
		render(
			<GradientEditor
				{...makeProps({
					mode: "solid",
					solidColorName: "blue-500",
					solidColorHex: "#3B82F6",
				})}
			/>,
		);
		// Type label showing "Solid"
		expect(screen.getByText("Solid")).toBeTruthy();
		// Color name shown as button
		expect(screen.getByText("blue-500")).toBeTruthy();
		// No gradient stop rows
		expect(screen.queryByText("5%")).toBeNull();
		expect(screen.queryByText("50%")).toBeNull();
		expect(screen.queryByText("95%")).toBeNull();
	});

	it("shows gradient stop color names", () => {
		render(<GradientEditor {...makeProps()} />);
		expect(screen.getByText("indigo-500")).toBeTruthy();
		expect(screen.getByText("purple-500")).toBeTruthy();
		expect(screen.getByText("pink-500")).toBeTruthy();
	});

	it("shows eye toggle and delete button on fill row", () => {
		render(<GradientEditor {...makeProps()} />);
		expect(screen.getByTitle("Hide fill")).toBeTruthy();
		expect(screen.getByTitle("Delete fill")).toBeTruthy();
	});

	it("shows add solid and add gradient buttons when no fill exists", () => {
		render(
			<GradientEditor
				{...makeProps({
					mode: "solid",
					solidColorName: null,
					solidColorHex: null,
				})}
			/>,
		);
		expect(screen.getByText("Solid")).toBeTruthy();
		expect(screen.getByText("Gradient")).toBeTruthy();
	});

	it("does not show color picker initially", () => {
		render(<GradientEditor {...makeProps()} />);
		expect(screen.queryByText("Editing")).toBeNull();
	});
});
