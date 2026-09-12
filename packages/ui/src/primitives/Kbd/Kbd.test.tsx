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
			"inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-hairline border border-current/25 bg-current/8 px-1 font-mono text-xs leading-none",
		);
		expect(kbd.className).not.toMatch(/border-b-2/);
		// The cap takes its text color from the text around it, so it sets none.
		expect(kbd.className).not.toMatch(/(^| )text-fg/);
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
