import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";
import { seedTickets } from "../../../../test/seedMany";
import { findGrid, grid, groupHeader, groupRows, resetUi, rows, spacer, storedUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(600);

beforeEach(() => {
	resetUi();
	installViewport();
});

const banner = () => document.querySelector<HTMLElement>("[data-cap-banner]");

// The seed holds 31 active, 19 done, and 2 canceled tickets in the CDE subtree.
describe("features/table/TicketTable", () => {
	// Outcome 3. 2369 seeded rows and the 31 of the seed make 2400.
	test("shows the cap banner above the rows when the list is capped", async () => {
		const server = createFakeServer();
		seedTickets(server, { project: "CDE", count: 2369 });
		renderApp({ path: "/p/CDE", actor: "navid", server });
		await findGrid();
		await waitFor(() => expect(banner()).not.toBeNull(), { timeout: 20_000 });
		expect(banner()!.textContent).toMatch(/first 2,?000 tickets/i);
		expect(within(banner()!).getByRole("link", { name: /narrow/i })).toBeDefined();
		const firstRow = rows()[0]!;
		expect(banner()!.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	}, 40_000);

	// Outcome 15
	test("collapses the Done and Canceled groups on a first visit", async () => {
		renderApp({ path: "/p/CDE", actor: "navid" });
		await findGrid();
		await waitFor(() => groupHeader("canceled"));
		expect(groupHeader("done").getAttribute("aria-expanded")).toBe("false");
		expect(within(groupHeader("done")).getByRole("button", { name: /show 19/i })).toBeDefined();
		expect(groupHeader("canceled").getAttribute("aria-expanded")).toBe("false");
		expect(within(groupHeader("canceled")).getByRole("button", { name: /show 2/i })).toBeDefined();
		expect(groupRows("done")).toHaveLength(0);
		expect(groupRows("canceled")).toHaveLength(0);
		for (const key of ["todo", "in-progress", "agent-review", "human-review"]) {
			expect(groupHeader(key).getAttribute("aria-expanded"), key).toBe("true");
		}
	});

	// Outcome 16. The toggle button carries the group's name. The stored
	// state is keyed by the route, so /all keeps its own.
	test("keeps a group's collapse state per route across a remount", async () => {
		const user = userEvent.setup();
		const first = renderApp({ path: "/p/CDE", actor: "navid" });
		await findGrid();
		await waitFor(() => groupHeader("in-progress"));
		expect(groupHeader("in-progress").getAttribute("aria-expanded")).toBe("true");
		await user.click(within(groupHeader("in-progress")).getByRole("button", { name: "In Progress" }));
		expect(groupHeader("in-progress").getAttribute("aria-expanded")).toBe("false");
		expect(storedUi().collapsedGroups["/p/CDE"]).toContain("in-progress");
		first.unmount();
		renderApp({ path: "/p/CDE", actor: "navid" });
		await findGrid();
		await waitFor(() => groupHeader("in-progress"));
		expect(groupHeader("in-progress").getAttribute("aria-expanded")).toBe("false");
		expect(groupRows("in-progress")).toHaveLength(0);
		expect(storedUi().collapsedGroups["/all"]).toBeUndefined();
	});

	// Outcome 20. 969 seeded rows and the 31 of the seed make 1000. Without
	// groups there is no header, so the spacer is the rows alone.
	test("virtualizes 1000 rows and sizes the scroller from the fixed row height", async () => {
		const server = createFakeServer();
		seedTickets(server, { project: "CDE", count: 969 });
		renderApp({ path: "/p/CDE?group=none", actor: "navid", server });
		await findGrid();
		await waitFor(() => expect(grid().getAttribute("aria-rowcount")).toBe("1000"), { timeout: 15_000 });
		expect(rows().length).toBeLessThan(60);
		expect(rows().length).toBeGreaterThan(10);
		expect(Number.parseFloat(spacer().style.height)).toBe(1000 * 36);
	}, 30_000);

	// Outcome 21
	test("exposes a grid with one roving tabindex", async () => {
		renderApp({ path: "/p/CDE", actor: "navid" });
		const table = await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(2));
		expect(table.getAttribute("role")).toBe("grid");
		for (const row of rows()) expect(within(row).getAllByRole("gridcell").length).toBeGreaterThan(4);
		expect(rows().filter((row) => row.getAttribute("tabindex") === "0")).toHaveLength(1);
		rows()[2]!.focus();
		expect(rows().filter((row) => row.getAttribute("tabindex") === "0")).toEqual([rows()[2]!]);
	});
});
