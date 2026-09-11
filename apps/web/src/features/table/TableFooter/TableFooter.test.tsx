import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { footer } from "../../../../test/table";
import { TableFooter } from "./TableFooter";

const text = () => footer().textContent!.replace(/\s+/g, " ");

describe("features/table/TableFooter", () => {
	// Outcome 31. The default URL sort is the table's own order, priority
	// then by the last update, and the footer says so. The bar is a fixed 28 px (h-7).
	// The bulk bar states the selected count, so the footer never does.
	test("states the ticket count and the active sort, and no selected count", () => {
		const view = render(<TableFooter total={42} sort="-updatedAt" />);
		expect(footer()).not.toBeNull();
		expect(text()).toMatch(/42 tickets/);
		expect(text()).not.toMatch(/selected/);
		expect(text()).toMatch(/sorted by priority, then by the last update/i);
		expect(footer().className).toMatch(/\bh-7\b/);
		view.rerender(<TableFooter total={1} sort="-createdAt" />);
		expect(text()).toMatch(/1 ticket\b/);
		expect(text()).not.toMatch(/selected/);
		expect(text()).toMatch(/sorted by created/i);
	});

	// TB-1. With Done and Canceled out of the view, the footer says how many
	// completed tickets it leaves out.
	test("names the open count and the completed tickets the view hides", () => {
		render(<TableFooter total={48} hidden={10} sort="-updatedAt" />);
		expect(text()).toMatch(/48 open · 10 completed hidden/);
		expect(text()).not.toMatch(/48 tickets/);
	});

	// TRL-36. The bar is a fixed 28 px, so neither span may wrap: a second
	// line falls outside the bar and the bar cuts it. The sort label is the
	// longer of the two, and it leaves the bar below 640 px, which gives the
	// count the whole width of a phone.
	test("neither span wraps, and the sort label leaves the bar below sm", () => {
		render(<TableFooter total={43} hidden={4} sort="-updatedAt" />);
		const spans = [...footer().querySelectorAll("span")];
		expect(spans).toHaveLength(2);
		for (const span of spans) expect(span.className).toMatch(/\bwhitespace-nowrap\b/);
		expect(spans[0]!.className).not.toMatch(/\bhidden\b/);
		expect(spans[1]!.className).toMatch(/\bhidden\b/);
		expect(spans[1]!.className).toMatch(/\bsm:block\b/);
	});
});
