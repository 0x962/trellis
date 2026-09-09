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
});
