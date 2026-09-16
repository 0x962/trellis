import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { ListFooter } from "./ListFooter";

const footer = () => document.querySelector<HTMLElement>("[data-list-footer]")!;

describe("features/shell/ListFooter", () => {
	// The board's bar states the count of the scope and the active sort. The
	// bar is a fixed 28 px (h-7), so the count arriving shifts nothing above it.
	test("states the ticket count and the active sort in a 28 px bar", () => {
		const view = render(<ListFooter total={43} sort="Sorted by priority, then by the last update" />);
		expect(footer().className).toMatch(/\bh-7\b/);
		expect(footer().textContent).toContain("43 tickets");
		expect(footer().textContent).toContain("Sorted by priority, then by the last update");
		view.rerender(<ListFooter total={1} sort="Manual order" />);
		expect(footer().textContent).toContain("1 ticket");
	});

	// TRL-36. The board's bar is the table's bar, so it takes the same rule:
	// neither span may wrap inside the fixed height, because a second line
	// falls outside the bar and the bar cuts it. The sort label is the longer
	// of the two, and it leaves the bar below 640 px.
	test("neither span wraps, and the sort label leaves the bar below sm", () => {
		render(<ListFooter total={43} sort="Sorted by priority, then by the last update" />);
		const spans = [...footer().querySelectorAll("span")];
		expect(spans).toHaveLength(2);
		for (const span of spans) expect(span.className).toMatch(/\bwhitespace-nowrap\b/);
		expect(spans[0]!.className).not.toMatch(/\bhidden\b/);
		expect(spans[1]!.className).toMatch(/\bhidden\b/);
		expect(spans[1]!.className).toMatch(/\bsm:block\b/);
	});

	// The count is undefined until it arrives, and the bar then states nothing
	// in its place.
	test("states no count before the count arrives", () => {
		render(<ListFooter total={undefined} sort="Manual order" />);
		expect([...footer().querySelectorAll("span")][0]!.textContent).toBe("");
	});

	test("shows a supplied status beside the ticket count", () => {
		render(<ListFooter total={43} sort="Manual order" status={<span role="status">5/22</span>} />);
		expect(footer().querySelector('[role="status"]')?.textContent).toBe("5/22");
	});
});
