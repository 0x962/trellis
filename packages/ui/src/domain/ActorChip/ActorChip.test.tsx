import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { ActorChip } from "./ActorChip";

describe("ActorChip", () => {
	test("human actor shows initials and a plain name without the agent suffix", () => {
		const { container } = render(<ActorChip name="navid" kind="human" />);
		const avatar = screen.getByLabelText("navid");
		expect(avatar.textContent).toBe("N");
		expectClasses(avatar, "rounded-sm");
		expectClasses(screen.getByText("navid"), "font-medium text-fg");
		expect(container.textContent).not.toContain("· agent");
	});

	test("agent actor shows the mono name, the agent suffix, and the live dot only when live", () => {
		const { container, rerender } = render(<ActorChip name="claude-code" kind="agent" live />);
		const avatar = screen.getByLabelText("claude-code · agent");
		expect(avatar.querySelector("svg[data-glyph=bot]")).not.toBeNull();
		expect(avatar.querySelector("[data-live]")).not.toBeNull();
		expectClasses(screen.getByText("claude-code"), "font-mono text-sm text-agent");
		expectClasses(screen.getByText("· agent"), "text-fg-faint");

		rerender(<ActorChip name="claude-code" kind="agent" />);
		expect(container.querySelector("[data-live]")).toBeNull();
	});

	// A narrow rail row has no room for the suffix. The mono purple name
	// still tells an agent from a human.
	test("compact drops the agent suffix and keeps the mono name", () => {
		const { container } = render(<ActorChip name="claude-code" kind="agent" compact />);
		expect(container.textContent).not.toContain("· agent");
		expectClasses(screen.getByText("claude-code"), "font-mono text-sm text-agent");
	});
});
