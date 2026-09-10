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
});
