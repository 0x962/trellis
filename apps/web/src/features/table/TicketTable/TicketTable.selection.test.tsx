import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, waitFor } from "@testing-library/react";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";
import { seedTickets } from "../../../../test/seedMany";
import { bulkBar, findGrid, footer, grid, press, resetUi, rows } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

// 977 seeded todo rows and the 23 of the seed make 1000 todo tickets.
const ready = async () => {
	const server = createFakeServer();
	seedTickets(server, { project: "CDE", count: 977 });
	const app = renderApp({ path: "/p/CDE?status=todo", actor: "navid", server });
	await findGrid();
	await waitFor(() => expect(grid().getAttribute("aria-rowcount")).toBe("1000"), { timeout: 15_000 });
	return app;
};

const selected = () => rows().map((row) => row.getAttribute("aria-selected") === "true");

describe("features/table/TicketTable: selection", () => {
	// Outcome 40
	test("extends the selection to a Shift-clicked row", async () => {
		await ready();
		rows()[1]!.focus();
		press("x");
		fireEvent.click(rows()[8]!, { shiftKey: true });
		expect(selected().slice(0, 10)).toEqual([false, true, true, true, true, true, true, true, true, false]);
		expect(bulkBar().textContent).toContain("8 selected");
	}, 30_000);

	// Outcome 41. The selection is a set of ids, so rows the virtualizer
	// never mounted are selected too.
	test("selects every filtered row on Cmd+A, not only the rendered ones", async () => {
		await ready();
		expect(rows().length).toBeLessThan(60);
		rows()[0]!.focus();
		press("a", { metaKey: true });
		expect(bulkBar().textContent).toMatch(/1,000 selected/);
		expect(footer().textContent).toMatch(/1,000 selected/);
		expect(selected().every(Boolean)).toBe(true);
	}, 30_000);
});
