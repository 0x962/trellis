import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	// An empty state reads as the opening of a document: a heading at the
	// left edge, the text under it, and no picture.
	test("empty state renders the title, the description, and the action at the left edge", () => {
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
		expect(empty.querySelector("svg")).toBeNull();
		screen.getByRole("button", { name: "New ticket" });
		expectClasses(empty, "items-start py-3 text-fg-muted");
	});

	// A page-level empty state fills the pane under the bar, and its 20 px of
	// side padding puts its first letter over the first letter of the bar.
	test("the page variant fills the pane with the padding of the bar above it", () => {
		const { container } = render(
			<EmptyState
				variant="page"
				title="Page not found"
				description="No page has this URL."
				action={<Button size="md">Needs you</Button>}
			/>,
		);
		const empty = container.firstElementChild!;
		expectClasses(empty, "flex-1 items-start px-5 pt-10");
		expectClasses(screen.getByRole("heading", { name: "Page not found" }), "text-xl font-semibold text-fg");
		expectClasses(screen.getByText("No page has this URL."), "max-w-xl text-sm text-fg-muted");
	});

	test("the section variant is the default", () => {
		const { container } = render(<EmptyState title="No sub-projects." />);
		const empty = container.firstElementChild!;
		expect(empty.className).not.toMatch(/flex-1|px-1/);
		expectClasses(empty, "py-3");
		expectClasses(screen.getByRole("heading", { name: "No sub-projects." }), "text-sm font-medium text-fg");
	});
});
