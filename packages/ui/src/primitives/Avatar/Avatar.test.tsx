import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
	test("human avatar renders initials in a square", () => {
		render(
			<>
				<Avatar kind="human" name="Dana Lee" />
				<Avatar kind="human" name="dana" />
			</>,
		);
		const full = screen.getByLabelText("Dana Lee");
		expect(full.textContent).toBe("DL");
		expect(screen.getByLabelText("dana").textContent).toBe("D");
		expectClasses(full, "size-4.5 rounded-sm bg-fg-muted text-surface text-initials font-semibold");
		expect(full.querySelector("svg")).toBeNull();
	});

	test("an agent avatar is a square of colour that its name picks", () => {
		render(
			<>
				<Avatar kind="agent" name="claude-code" />
				<Avatar kind="agent" name="codex" />
			</>,
		);
		const avatar = screen.getByLabelText("claude-code · agent");
		expect(avatar.textContent).toBe("");
		expect(avatar.querySelector("svg")).toBeNull();
		expectClasses(avatar, "size-4.5 rounded-sm");
		// The name picks the picture, so one name always draws the same one
		// and two names draw two.
		const image = avatar.getAttribute("style")!;
		expect(image).toContain("radial-gradient");
		expect(screen.getByLabelText("codex · agent").getAttribute("style")).not.toBe(image);
	});

	test("the live dot renders only when live and stops under reduced motion", () => {
		render(
			<>
				<Avatar kind="agent" name="claude-code" live />
				<Avatar kind="agent" name="codex" live={false} />
				<Avatar kind="human" name="dana" live />
			</>,
		);
		const dot = screen.getByLabelText("claude-code · agent").querySelector("[data-live]")!;
		expect(dot).not.toBeNull();
		expectClasses(dot, "bg-success border-surface animate-pulse-live motion-reduce:animate-none");
		expect(screen.getByLabelText("codex · agent").querySelector("[data-live]")).toBeNull();
		expect(screen.getByLabelText("dana").querySelector("[data-live]")).not.toBeNull();
		// The dot sits over the top right corner. A clip on the avatar would cut
		// it down to a speck inside the picture.
		expect(dot.parentElement!.className).not.toContain("overflow-hidden");
	});
});
