import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
	test("human avatar renders initials in a circle", () => {
		render(
			<>
				<Avatar kind="human" name="Navid Khan" />
				<Avatar kind="human" name="navid" />
			</>,
		);
		const full = screen.getByLabelText("Navid Khan");
		expect(full.textContent).toBe("NK");
		expect(screen.getByLabelText("navid").textContent).toBe("N");
		expectClasses(full, "size-4.5 rounded-full bg-fg-muted text-surface text-initials font-semibold");
		expect(full.querySelector("svg")).toBeNull();
	});

	test("an agent avatar is a circle of colour that its name picks", () => {
		render(
			<>
				<Avatar kind="agent" name="claude-code" />
				<Avatar kind="agent" name="codex" />
			</>,
		);
		const avatar = screen.getByLabelText("claude-code · agent");
		expect(avatar.textContent).toBe("");
		expect(avatar.querySelector("svg")).toBeNull();
		expectClasses(avatar, "size-4.5 rounded-full overflow-hidden");
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
				<Avatar kind="human" name="navid" live />
			</>,
		);
		const dot = screen.getByLabelText("claude-code · agent").querySelector("[data-live]")!;
		expect(dot).not.toBeNull();
		expectClasses(dot, "bg-success border-surface animate-pulse-live motion-reduce:animate-none");
		expect(screen.getByLabelText("codex · agent").querySelector("[data-live]")).toBeNull();
		expect(screen.getByLabelText("navid").querySelector("[data-live]")).not.toBeNull();
	});
});
