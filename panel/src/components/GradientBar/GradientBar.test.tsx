import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradientBar } from "./GradientBar";
import type { GradientStop } from "./types";

const twoStops: GradientStop[] = [
	{ id: "1", role: "from", colorName: "blue-500", hex: "#3B82F6", position: 0 },
	{ id: "2", role: "to", colorName: "pink-500", hex: "#EC4899", position: 100 },
];

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

const defaultProps = {
	direction: "to right",
	onStopDrag: vi.fn(),
	onStopDragEnd: vi.fn(),
	onStopClick: vi.fn(),
	onBarClick: vi.fn(),
	onStopRemove: vi.fn(),
	selectedStopId: null,
};

describe("GradientBar", () => {
	it("renders pill handles for each stop", () => {
		const { container } = render(
			<GradientBar {...defaultProps} stops={twoStops} />,
		);
		const handles = container.querySelectorAll(".rounded-full");
		expect(handles).toHaveLength(2);
	});

	it("renders three handles for three stops", () => {
		const { container } = render(
			<GradientBar {...defaultProps} stops={threeStops} />,
		);
		const handles = container.querySelectorAll(".rounded-full");
		expect(handles).toHaveLength(3);
	});

	it("renders a gradient track", () => {
		const { container } = render(
			<GradientBar {...defaultProps} stops={twoStops} />,
		);
		const track = container.querySelector(".rounded-lg");
		expect(track).toBeTruthy();
		expect(track?.getAttribute("style")).toContain("linear-gradient");
	});

	it("applies teal border to the selected handle", () => {
		const { container } = render(
			<GradientBar {...defaultProps} stops={twoStops} selectedStopId="1" />,
		);
		const handles = container.querySelectorAll(".rounded-full");
		const firstStyle = handles[0]?.getAttribute("style") ?? "";
		expect(firstStyle).toContain("rgb(0, 132, 139)");
	});

	it("applies white border to unselected handles", () => {
		const { container } = render(
			<GradientBar {...defaultProps} stops={twoStops} selectedStopId="1" />,
		);
		const handles = container.querySelectorAll(".rounded-full");
		const secondStyle = handles[1]?.getAttribute("style") ?? "";
		expect(secondStyle).toContain("rgba(255, 255, 255, 0.85)");
	});

	it("calls onBarClick when the track is clicked", () => {
		const onBarClick = vi.fn();
		const { container } = render(
			<GradientBar
				{...defaultProps}
				stops={twoStops}
				onBarClick={onBarClick}
			/>,
		);
		const track = container.querySelector(".rounded-lg");
		if (track) {
			fireEvent.click(track, { clientX: 50 });
			expect(onBarClick).toHaveBeenCalledTimes(1);
		}
	});
});
