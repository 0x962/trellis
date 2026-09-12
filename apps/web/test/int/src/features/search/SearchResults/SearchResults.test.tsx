import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../../../renderWithProviders";

beforeEach(() => localStorage.clear());

const cellsOf = (row: HTMLElement) => [...row.querySelectorAll("td")];

// The fixed width of a set of cells in px, from the Tailwind size class of
// each one and its row padding. Tailwind's `w-<n>` is n times 4 px.
const fixedWidth = (cells: readonly HTMLTableCellElement[]) =>
	cells.reduce((sum, cell) => {
		const match = /(?:^| )w-(\d+)(?: |$)/.exec(cell.className);
		const pad = /(?:^| )p[lr]-5(?: |$)/.test(cell.className) ? 20 : 0;
		return sum + (match === null ? 0 : Number(match[1]) * 4) + pad;
	}, 0);

const firstRow = async () => {
	const grid = await screen.findByRole("grid", { name: "Search results" });
	await waitFor(() => expect(within(grid).getAllByRole("row").length).toBeGreaterThan(0));
	return within(grid).getAllByRole("row")[0]!;
};

// At 768 px and up a result reads as a table row with the same six columns
// the ticket table draws. `table-fixed` hands the fixed columns their width
// first, so the title column gets what is left. The whole fixed set is
// wider than a 390 px phone, which is why the phone takes the two-line row
// in SearchResults.phone.test.tsx.
describe("features/search/SearchResults", () => {
	test("draws six table cells at 768 px and up", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const cells = cellsOf(await firstRow());
		expect(cells).toHaveLength(6);
		for (const cell of cells) expect(cell.getAttribute("colspan")).toBeNull();
	});

	test("the fixed columns are wider than a 390 px phone", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		expect(fixedWidth(cellsOf(await firstRow()))).toBeGreaterThan(390);
	});

	// A project result spans the columns it has no value for, so the title
	// column stays lined up with the ticket rows above it.
	test("the project row spans the columns it leaves empty", async () => {
		renderApp({ path: "/search?q=trellis", actor: "dana" });
		const grid = await screen.findByRole("grid", { name: "Search results" });
		const link = await within(grid).findByRole("link", { name: "TRL" });
		const cells = cellsOf(link.closest("tr")!);
		expect(cells).toHaveLength(3);
		expect(cells[0]!.getAttribute("colspan")).toBe("2");
		expect(cells[2]!.getAttribute("colspan")).toBe("3");
	});

	// TRL-35. A query that matches no ticket and no project reaches the same
	// empty state the page shows with no query, and the title names the query.
	// The bare "0 tickets" line over an empty page is gone.
	test("a query that matches nothing shows the empty state with the query in the title", async () => {
		renderApp({ path: "/search?q=zzqqwxyv", actor: "dana" });
		expect(await screen.findByRole("heading", { name: "No results for 'zzqqwxyv'" })).toBeDefined();
		expect(screen.queryByRole("grid", { name: "Search results" })).toBeNull();
		expect(screen.queryByText(/0 tickets/)).toBeNull();
	});

	// The empty state belongs to the zero-result case only. A query that
	// matches still lists its rows.
	test("a query that matches lists its rows and shows no empty state", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const grid = await screen.findByRole("grid", { name: "Search results" });
		await waitFor(() => expect(within(grid).getAllByRole("row").length).toBeGreaterThan(0));
		expect(screen.queryByRole("heading", { name: /^No results for/ })).toBeNull();
	});

	// A filter that removes every ticket of a matching query reaches the same
	// state, because the page then has nothing to list either.
	test("a filter that removes every match shows the empty state", async () => {
		renderApp({ path: "/search?q=oauth&priority=none", actor: "dana" });
		expect(await screen.findByRole("heading", { name: "No results for 'oauth'" })).toBeDefined();
		expect(screen.queryByRole("grid", { name: "Search results" })).toBeNull();
	});
});
