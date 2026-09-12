import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	test("empty state renders icon, title, description, and action", () => {
		const { container } = render(
			<EmptyState
				title="Nothing needs you"
				description="Every review is done. Every check passed."
				action={<Button>New ticket</Button>}
			/>,
		);
		screen.getByRole("heading", { name: "Nothing needs you" });
		expectClasses(screen.getByText("Every review is done. Every check passed."), "text-fg-muted");
		const empty = container.firstElementChild!;
		expect(empty.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
		screen.getByRole("button", { name: "New ticket" });
		expectClasses(empty, "py-10 text-center text-fg-muted");
	});

	// A page-level empty state fills the pane and sits near 35% of its
	// height: the block is centered, and the bottom padding lifts it.
	test("the page variant fills the pane and lifts the block above the center", () => {
		const { container } = render(
			<EmptyState
				variant="page"
				title="Page not found"
				description="No page has this URL."
				action={<Button size="md">Needs you</Button>}
			/>,
		);
		const empty = container.firstElementChild!;
		expectClasses(empty, "flex-1 justify-center pb-[15vh]");
		expectClasses(screen.getByRole("heading", { name: "Page not found" }), "text-md font-semibold text-fg");
		expectClasses(screen.getByText("No page has this URL."), "text-sm text-fg-muted max-w-sm");
		expectClasses(empty.querySelector("span[aria-hidden]")!, "size-6 text-fg-faint");
	});

	test("the section variant is the default", () => {
		const { container } = render(<EmptyState title="No sub-projects." />);
		expect(container.firstElementChild!.className).not.toMatch(/flex-1/);
		expectClasses(container.firstElementChild!, "py-10");
	});
});
