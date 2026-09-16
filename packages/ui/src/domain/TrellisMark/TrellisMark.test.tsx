import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TrellisMark } from "./TrellisMark";

describe("TrellisMark", () => {
	test("draws the manager lattice on the fixed dark square", () => {
		const { container } = render(<TrellisMark />);
		const svg = container.querySelector("svg")!;
		expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
		expect(svg.getAttribute("aria-hidden")).toBe("true");
		const square = svg.querySelector("rect")!;
		expect(square.getAttribute("rx")).toBe("7");
		expect(square.getAttribute("class")).toContain("persona-ground");
		const strokes = svg.querySelectorAll("path");
		expect(strokes).toHaveLength(4);
		expect(svg.getAttribute("data-persona-kind")).toBe("manager");
	});

	test("the sidebar mark has a transparent ground and follows its work state", () => {
		const { container, rerender } = render(<TrellisMark background={false} working />);
		expect(container.querySelector(".persona-ground")).toBeNull();
		expect(container.querySelector("svg")!.getAttribute("data-state")).toBe("working");
		expect(container.querySelector(".persona-effect")).not.toBeNull();
		rerender(<TrellisMark background={false} />);
		expect(container.querySelector("svg")!.getAttribute("data-state")).toBe("static");
		expect(container.querySelector(".persona-effect")).toBeNull();
	});

	test("a labeled mark is an image with that name", () => {
		render(<TrellisMark label="trellis" className="size-8" />);
		const image = screen.getByRole("img", { name: "trellis" });
		expect(image.getAttribute("class")).toContain("size-8");
	});
});
