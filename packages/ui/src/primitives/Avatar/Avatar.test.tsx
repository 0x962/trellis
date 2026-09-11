import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
	test("human avatar renders initials in a square", () => {
		render(
			<>
				<Avatar kind="human" name="Navid Khan" />
				<Avatar kind="human" name="navid" />
			</>,
		);
		const full = screen.getByLabelText("Navid Khan");
		expect(full.textContent).toBe("NK");
		expect(screen.getByLabelText("navid").textContent).toBe("N");
		expectClasses(full, "size-4.5 rounded-sm bg-fg-muted text-surface text-initials font-semibold");
		expect(full.querySelector("svg")).toBeNull();
	});

	test("agent avatar renders the bot glyph in a square", () => {
		render(<Avatar kind="agent" name="claude-code" />);
		const avatar = screen.getByLabelText("claude-code · agent");
		expect(avatar.textContent).toBe("");
		expect(avatar.querySelector("svg[data-glyph=bot]")).not.toBeNull();
		expectClasses(avatar, "rounded-sm bg-agent-soft text-agent border-agent");
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
