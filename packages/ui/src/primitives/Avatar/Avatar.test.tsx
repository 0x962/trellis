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

	test("an agent avatar is a circle of color that its name picks", () => {
		render(
			<>
				<Avatar kind="agent" name="claude-code" />
				<Avatar kind="agent" name="codex" />
			</>,
		);
		const avatar = screen.getByLabelText("claude-code · agent");
		expect(avatar.textContent).toBe("");
		expect(avatar.querySelector("svg")).toBeNull();
		expectClasses(avatar, "size-4.5 rounded-round");
		// The name picks the picture, so one name always draws the same one
		// and two names draw two.
		const image = avatar.getAttribute("style")!;
		expect(image).toContain("radial-gradient");
		expect(screen.getByLabelText("codex · agent").getAttribute("style")).not.toBe(image);
	});
});
