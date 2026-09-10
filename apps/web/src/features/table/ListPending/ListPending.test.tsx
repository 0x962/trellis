import { describe, expect, test } from "bun:test";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ListPending } from "./ListPending";

// ER-2. A list route that takes more than 300 ms shows the shape of its
// view: the page frame, then rows or cards that the data replaces in place.
describe("features/table/ListPending", () => {
	test("a table route shows 36 px skeleton rows with a 64 px ID bar", () => {
		renderWithProviders(<ListPending view="table" title="All tickets" />, { path: "/all", actor: "navid" });
		const rows = [...document.querySelectorAll<HTMLElement>("[data-table-skeleton] > div")];
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(row.style.height).toBe("36px");
		expect(document.querySelector("[data-table-skeleton] .w-16")).not.toBeNull();
		expect(document.querySelector("h1")?.textContent).toBe("All tickets");
	});

	test("a board route shows 3 columns of 3 cards", () => {
		renderWithProviders(<ListPending view="board" title="All tickets" />, { path: "/all/board", actor: "navid" });
		const columns = document.querySelectorAll("[data-board-skeleton] > div");
		expect(columns).toHaveLength(3);
		for (const column of columns) expect(column.querySelectorAll(".h-19")).toHaveLength(3);
	});
});
