import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses, expectFocusRing } from "../../../test/classes";
import { ScrollArea } from "./ScrollArea";

describe("ScrollArea", () => {
	test("scroll area wraps content in a viewport with a themed scrollbar", () => {
		const { container } = render(
			<ScrollArea className="h-40">
				<p>long content</p>
			</ScrollArea>,
		);
		const outer = container.firstElementChild!;
		expectClasses(outer, "h-40");
		const viewport = screen.getByText("long content").closest(".overflow-auto")!;
		expectFocusRing(viewport);
		expect(viewport).not.toBeNull();
		expect(outer.contains(viewport)).toBe(true);
		const scrollbar = outer.querySelector(".bg-border-strong")!;
		expect(scrollbar).not.toBeNull();
		expectClasses(scrollbar, "rounded-sm");
	});

	// Skeleton hides itself from a screen reader, so the region around it
	// carries the name and the busy flag.
	test("a named region says whether its content still loads", () => {
		const { container } = render(
			<ScrollArea label="Manager instructions" busy>
				<p>loading</p>
			</ScrollArea>,
		);
		const outer = container.firstElementChild!;
		expect(outer.getAttribute("role")).toBe("region");
		expect(outer.getAttribute("aria-label")).toBe("Manager instructions");
		expect(outer.getAttribute("aria-busy")).toBe("true");
	});

	test("a scroll area without a label carries no region role", () => {
		const { container } = render(
			<ScrollArea>
				<p>plain</p>
			</ScrollArea>,
		);
		const outer = container.firstElementChild!;
		expect(outer.hasAttribute("role")).toBe(false);
		expect(outer.hasAttribute("aria-busy")).toBe(false);
	});
});
