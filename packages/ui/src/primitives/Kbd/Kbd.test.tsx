import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Kbd } from "./Kbd";

describe("Kbd", () => {
	test("renders a kbd element with the mockup treatment", () => {
		render(<Kbd>⌘K</Kbd>);
		const kbd = screen.getByText("⌘K");
		expect(kbd.tagName).toBe("KBD");
		expectClasses(kbd, "font-mono text-kbd border-border border-b-2 rounded-sm text-fg-muted bg-surface px-1");
	});
});
