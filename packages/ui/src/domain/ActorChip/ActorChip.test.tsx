import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { ActorChip } from "./ActorChip";

describe("ActorChip", () => {
	test("human actor shows initials and a plain name without the agent suffix", () => {
		const { container } = render(<ActorChip name="dana" kind="human" />);
		const avatar = screen.getByLabelText("dana");
		expect(avatar.textContent).toBe("D");
		expectClasses(avatar, "rounded-round");
		expectClasses(screen.getByText("dana"), "font-medium text-fg");
		expect(container.textContent).not.toContain("· agent");
	});

	test("agent actor shows the purple name, the agent suffix, and the live dot only when live", () => {
		const { container, rerender } = render(<ActorChip name="claude-code" kind="agent" live />);
		const avatar = screen.getByLabelText("claude-code · agent");
		// The agent mark is the picture its name picks, not a glyph.
		expect(avatar.querySelector("svg")).toBeNull();
		expect(avatar.getAttribute("style")).toContain("radial-gradient");
		expect(avatar.querySelector("[data-live]")).not.toBeNull();
		expectClasses(screen.getByText("claude-code"), "text-sm text-agent");
		expectClasses(screen.getByText("· agent"), "text-fg-faint");

		rerender(<ActorChip name="claude-code" kind="agent" />);
		expect(container.querySelector("[data-live]")).toBeNull();
	});

	// A narrow rail row has no room for the suffix. The purple name
	// still tells an agent from a human.
	test("compact drops the agent suffix and keeps the purple name", () => {
		const { container } = render(<ActorChip name="claude-code" kind="agent" compact />);
		expect(container.textContent).not.toContain("· agent");
		expectClasses(screen.getByText("claude-code"), "text-sm text-agent");
	});
});
