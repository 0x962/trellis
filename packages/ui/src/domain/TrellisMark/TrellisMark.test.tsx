import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TrellisMark } from "./TrellisMark";

describe("TrellisMark", () => {
	// The mark is the favicon drawing: a lattice of two strokes in each
	// diagonal direction, on a dark rounded square, on a 32 px grid.
	test("draws the lattice in the accent on the fixed dark square", () => {
		const { container } = render(<TrellisMark />);
		const svg = container.querySelector("svg")!;
		expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
		expect(svg.getAttribute("aria-hidden")).toBe("true");
		const square = svg.querySelector("rect")!;
		expect(square.getAttribute("rx")).toBe("7");
		expect(square.getAttribute("class")).toContain("fill-mark");
		const strokes = svg.querySelectorAll("path");
		expect(strokes).toHaveLength(4);
		for (const stroke of strokes) expect(stroke.getAttribute("class")).toContain("stroke-accent");
	});

	test("a labeled mark is an image with that name", () => {
		render(<TrellisMark label="trellis" className="size-8" />);
		const image = screen.getByRole("img", { name: "trellis" });
		expect(image.getAttribute("class")).toContain("size-8");
	});
});
