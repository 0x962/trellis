import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { bulkBar, filterBar, findGrid, press, resetUi, rows } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

// The phone query mock replaces a window global, so each test puts the
// original back for the test files that run after it.
const matchMedia = window.matchMedia;
afterEach(() => {
	window.matchMedia = matchMedia;
});

beforeEach(() => {
	resetUi();
	installViewport();
	mockMatchMedia(true);
});

// MB-B. Below 768 px a row is two lines: priority, ID, status icon, and time
// on the first, the title on the second.
describe("features/table/TicketTable: phone width", () => {
	test("rows are two 56 px lines with no PR, actor, or project cell", async () => {
		renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		for (const row of rows()) expect(row.style.height).toBe("56px");
		for (const column of ["pr", "actor", "project"]) {
			expect(document.querySelectorAll(`[role="gridcell"][data-column="${column}"]`)).toHaveLength(0);
		}
		expect(rows()[0]!.querySelector('[data-line="title"]')).not.toBeNull();
	});

	test("the filter bar scrolls on the x axis", async () => {
		renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		expect(filterBar().className).toMatch(/\boverflow-x-auto\b/);
	});

	test("the bulk bar spans the width", async () => {
		renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		rows()[0]!.focus();
		press("x");
		expect(bulkBar().className).toMatch(/\bmax-md:left-4\b/);
		expect(bulkBar().className).toMatch(/\bmax-md:right-4\b/);
	});
});
