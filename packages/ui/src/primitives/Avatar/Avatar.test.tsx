import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
	test("human avatar renders initials on static metal film", () => {
		render(
			<>
				<Avatar kind="human" name="Dana Lee" />
				<Avatar kind="human" name="dana" />
			</>,
		);
		const full = screen.getByLabelText("Dana Lee");
		expect(full.textContent).toBe("DL");
		expect(screen.getByLabelText("dana").textContent).toBe("D");
		expectClasses(full, "size-4.5 rounded-round profile-metal text-initials font-semibold");
		expect(full.className).not.toContain("animate-");
		expect(full.querySelector("span")?.textContent).toBe("DL");
		expect(full.querySelector("svg")).toBeNull();
	});

	test("a persona has a stable shape and color", () => {
		render(
			<>
				<Avatar kind="agent" name="Builder" />
				<Avatar kind="agent" name="builder" />
				<Avatar kind="agent" name="Trellis" />
			</>,
		);
		const builder = screen.getByLabelText("Builder · agent");
		const trellis = screen.getByLabelText("Trellis · agent");
		expect(builder.className).not.toContain("profile-metal");
		expect(builder.querySelector("svg") !== null).toBe(true);
		expect(builder.innerHTML).toBe(screen.getByLabelText("builder · agent").innerHTML);
		expect(builder.innerHTML).not.toBe(trellis.innerHTML);
		expect(builder.getAttribute("style")).toBeNull();
	});
});

test("builder and reviewer share four overlapping strokes with upright persona letters", () => {
	const { container } = render(
		<>
			<Avatar kind="agent" name="Builder" />
			<Avatar kind="agent" name="Risk-Based Code Review" />
		</>,
	);
	const [builder, reviewer] = container.querySelectorAll("svg");
	expect(builder!.getAttribute("viewBox")).toBe("0 0 32 32");
	expect([...builder!.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual(
		[...reviewer!.querySelectorAll("path")].map((path) => path.getAttribute("d")),
	);
	expect(reviewer!.querySelector('g[transform="rotate(45 16 16)"]')).not.toBeNull();
	expect(builder!.querySelector("text")!.textContent).toBe("B");
	expect(reviewer!.querySelector("text")!.textContent).toBe("RR");
	expect(reviewer!.querySelector("text")!.closest("[transform]")).toBeNull();
});

test("explicit persona roles control custom persona shapes", () => {
	const { container } = render(<Avatar kind="agent" name="Release Engineer" personaKind="builder" />);
	expect(container.querySelector("svg")!.getAttribute("data-persona-kind")).toBe("builder");
	expect(container.querySelector("text")!.textContent).toBe("RE");
});

test("static marks have no effect definitions or motion layers", () => {
	const { container } = render(<Avatar kind="agent" name="Trellis" />);
	expect(container.querySelector("defs")).toBeNull();
	expect(container.querySelector("svg")!.getAttribute("data-state")).toBe("static");
	expect(container.querySelectorAll("path")).toHaveLength(4);
});

test("only managers get a full working state and each glimmer has its own mask", () => {
	const { container, rerender } = render(
		<>
			<Avatar kind="agent" name="Trellis" state="working" />
			<Avatar kind="agent" name="Builder" state="working" />
			<Avatar kind="agent" name="Reviewer" state="working" />
		</>,
	);
	const marks = [...container.querySelectorAll("svg")];
	expect(marks.map((mark) => mark.getAttribute("data-state"))).toEqual(["working", "working-mild", "working-mild"]);
	expect(marks[0]!.querySelectorAll(".persona-rotor")).toHaveLength(2);
	expect(marks[1]!.querySelector(".persona-rotor")).toBeNull();
	expect(marks[2]!.querySelector(".persona-rotor")).toBeNull();
	const masks = [...container.querySelectorAll("mask")].map((mask) => mask.id);
	expect(new Set(masks).size).toBe(3);
	for (const mark of marks)
		expect(mark.querySelector(".persona-glimmer")!.getAttribute("mask")).toBe(
			`url(#${mark.querySelector("mask")!.id})`,
		);
	expect(screen.getByLabelText("Trellis · agent · working")).toBeTruthy();
	rerender(<Avatar kind="agent" name="Trellis" state="static" />);
	expect(container.querySelector(".persona-effect")).toBeNull();
	expect(screen.getByLabelText("Trellis · agent")).toBeTruthy();
});
