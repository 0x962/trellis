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

	test("agent actor shows the standard name color and the agent suffix", () => {
		render(<ActorChip name="claude-code" kind="agent" />);
		const avatar = screen.getByLabelText("claude-code · agent");
		expect(avatar.querySelector("svg") !== null).toBe(true);
		expect(avatar.getAttribute("style")).toBeNull();
		expectClasses(screen.getByText("claude-code"), "text-sm text-fg");
		expectClasses(screen.getByText("· agent"), "text-fg-faint");
	});

	test("compact drops the agent suffix and keeps the standard name color", () => {
		const { container } = render(<ActorChip name="claude-code" kind="agent" compact />);
		expect(container.textContent).not.toContain("· agent");
		expectClasses(screen.getByText("claude-code"), "text-sm text-fg");
	});
});
