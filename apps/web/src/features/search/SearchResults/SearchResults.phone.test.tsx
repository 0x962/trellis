import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";

// The phone query mock replaces a window global, so each test puts the
// original back for the test files that run after it.
const matchMedia = window.matchMedia;
afterEach(() => {
	window.matchMedia = matchMedia;
});

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(true);
});

const cellsOf = (row: HTMLElement) => [...row.querySelectorAll("td")];

const firstRow = async () => {
	const grid = await screen.findByRole("grid", { name: "Search results" });
	await waitFor(() => expect(within(grid).getAllByRole("row").length).toBeGreaterThan(0));
	return within(grid).getAllByRole("row")[0]!;
};

// TRL-31. Below 768 px a result takes the table's phone row: one cell over
// the whole row, two lines in it, and one link that fills the 56 px box. A
// tap anywhere on the row opens the result, so the target clears the 44 px
// minimum on both axes.
describe("features/search/SearchResults: phone width", () => {
	test("a ticket row is one cell with one link over the 56 px box", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const row = await firstRow();
		const cells = cellsOf(row);
		expect(cells).toHaveLength(1);
		expect(cells[0]!.getAttribute("colspan")).toBe("6");
		expect(row.className).toContain("h-14");
		const links = [...cells[0]!.querySelectorAll("a")];
		expect(links).toHaveLength(1);
		expect(links[0]!.className).toContain("h-14");
		expect(links[0]!.className).toContain("w-full");
	});

	test("the title takes the second line of the row", async () => {
		renderApp({ path: "/search?q=oauth", actor: "dana" });
		const row = await firstRow();
		const title = row.querySelector('[data-line="title"]');
		expect(title).not.toBeNull();
		expect(title!.textContent!.toLowerCase()).toContain("oauth");
	});

	test("a project row takes the same box and the same link", async () => {
		renderApp({ path: "/search?q=trellis", actor: "dana" });
		const grid = await screen.findByRole("grid", { name: "Search results" });
		const link = await within(grid).findByRole("link", { name: /^TRL/ });
		const cells = cellsOf(link.closest("tr")!);
		expect(cells).toHaveLength(1);
		expect(cells[0]!.getAttribute("colspan")).toBe("6");
		expect(link.className).toContain("h-14");
	});
});
