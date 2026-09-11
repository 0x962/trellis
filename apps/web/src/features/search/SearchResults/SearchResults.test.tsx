import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../../test/renderWithProviders";

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

const shown = (cells: readonly HTMLTableCellElement[]) => cells.filter((cell) => !cell.className.includes("hidden"));

const firstRow = async () => {
	const grid = await screen.findByRole("grid", { name: "Search results" });
	await waitFor(() => expect(within(grid).getAllByRole("row").length).toBeGreaterThan(0));
	return within(grid).getAllByRole("row")[0]!;
};

// TRL-28. `table-fixed` hands the fixed columns their width first, so the
// title column gets what is left. The whole set is wider than a 390 px
// phone. Below 640 px the project, the status, and the time leave the row,
// and the title keeps the space.
describe("features/search/SearchResults", () => {
	test("hides the project, status, and time cells below 640 px", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const cells = cellsOf(await firstRow());
		expect(cells).toHaveLength(6);
		// Priority, ID, and title stay on every width.
		for (const index of [0, 1, 2]) expect(cells[index]!.className).not.toContain("hidden");
		// Project, status, and time come back at the sm breakpoint.
		for (const index of [3, 4, 5]) expect(cells[index]!.className).toContain("hidden sm:table-cell");
	});

	test("leaves the title at least 200 px on a 390 px phone", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const cells = cellsOf(await firstRow());
		expect(fixedWidth(cells)).toBeGreaterThan(390);
		expect(390 - fixedWidth(shown(cells))).toBeGreaterThanOrEqual(200);
	});

	// A project result spans the columns the phone drops, so its last cell
	// leaves the row with them and the columns stay lined up.
	test("the project row drops the cell that spans the hidden columns", async () => {
		renderApp({ path: "/search?q=trellis", actor: "dana" });
		const grid = await screen.findByRole("grid", { name: "Search results" });
		const link = await within(grid).findByRole("link", { name: "TRL" });
		const cells = cellsOf(link.closest("tr")!);
		expect(cells).toHaveLength(3);
		expect(cells[2]!.getAttribute("colspan")).toBe("3");
		expect(cells[2]!.className).toContain("hidden sm:table-cell");
	});
});
