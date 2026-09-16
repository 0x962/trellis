import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
	test("human avatar renders initials in a circle", () => {
		render(
			<>
				<Avatar kind="human" name="Dana Lee" />
				<Avatar kind="human" name="dana" />
			</>,
		);
		const full = screen.getByLabelText("Dana Lee");
		expect(full.textContent).toBe("DL");
		expect(screen.getByLabelText("dana").textContent).toBe("D");
		expectClasses(full, "size-4.5 rounded-round bg-fg-muted text-surface text-initials font-semibold");
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
		expect(builder.querySelector("svg") !== null).toBe(true);
		expect(builder.innerHTML).toBe(screen.getByLabelText("builder · agent").innerHTML);
		expect(builder.innerHTML).not.toBe(trellis.innerHTML);
		expect(builder.getAttribute("style")).toBeNull();
	});
});
