import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Kbd } from "./Kbd";

describe("Kbd", () => {
	test("renders a kbd element with the one key cap style", () => {
		render(<Kbd>⌘K</Kbd>);
		const kbd = screen.getByText("⌘K");
		expect(kbd.tagName).toBe("KBD");
		expectClasses(
			kbd,
			"inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-border-strong bg-surface px-1 font-mono text-xs leading-none text-fg-muted",
		);
		expect(kbd.className).not.toMatch(/border-b-2/);
	});

	// A caller that still passes `tone` gets the same key cap.
	test("the tone prop changes nothing", () => {
		render(
			<>
				<Kbd>a</Kbd>
				<Kbd tone="inverse">b</Kbd>
			</>,
		);
		expect(screen.getByText("b").className).toBe(screen.getByText("a").className);
	});
});
