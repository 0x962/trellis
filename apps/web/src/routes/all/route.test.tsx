import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../test/renderWithProviders";
import { columnHeaders, findGrid, grid, identifiers, inputs, resetUi, rows } from "../../../test/table";
import { tableViewport } from "../../../test/viewport";

beforeEach(() => localStorage.clear());

describe("routes/all", () => {
	// WS-83. The footer is a fixed 28 px row (h-7), so the count arriving
	// never shifts the list.
	test("All tickets shows the topbar chrome and the count footer", async () => {
		const { server } = renderApp({ path: "/all", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "All tickets" })).toBeDefined();
		const group = screen.getByRole("radiogroup", { name: "View" });
		expect(within(group).getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
		expect(within(group).getByRole("radio", { name: "Board" }).getAttribute("aria-checked")).toBe("false");
		expect(document.querySelector("[data-filter-bar]")).not.toBeNull();
		const { total } = await server.client.tickets.counts({});
		const footer = document.querySelector("[data-list-footer]")!;
		expect(footer).not.toBeNull();
		expect(footer.className).toMatch(/\bh-7\b/);
		await waitFor(() => expect(footer.textContent).toContain(String(total)));
	});
});

// The table on the all-tickets route. The seed holds 31 + 14 + 3 = 48 active
// tickets across CDE, TRL, and MRG.
describe("routes/all: the table", () => {
	const installViewport = tableViewport(800);

	beforeEach(() => {
		resetUi();
		installViewport();
	});

	// Outcome 111
	test("renders every project's tickets with the project column on /all", async () => {
		const { server } = renderApp({ path: "/all", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(grid().getAttribute("aria-rowcount")).toBe("48"));
		await waitFor(() => expect(rows().length).toBeGreaterThan(5));
		for (const input of inputs(server, "tickets.list")) expect(input).not.toHaveProperty("project");
		expect(columnHeaders()).toContain("project");
		expect(document.querySelectorAll('[role="gridcell"][data-column="project"]').length).toBe(rows().length);
		const keys = new Set(identifiers().map((identifier) => identifier!.split("-")[0]));
		expect(keys.size).toBeGreaterThanOrEqual(2);
	});
});
