import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderApp } from "../../../../../renderWithProviders";
import { findGrid, press, resetUi, rows } from "../../../../../table";
import { tableViewport } from "../../../../../viewport";
import { commandActions, useCommandStore } from "../../../../../../src/features/command/commandStore";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
	commandActions.reset();
});

describe("features/table/TicketTable: command context", () => {
	// The palette's This ticket section acts on the focused row, and its
	// Selection section on the selected rows.
	test("the focused row and the selection reach the command palette", async () => {
		renderApp({ path: "/p/CDE/table", actor: "dana" });
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(1));
		const second = rows()[1]!;
		const identifier = second.dataset.identifier!;
		second.focus();
		press("j");
		press("k");
		await waitFor(() => expect(useCommandStore.getState().focusedTicket).toBe(identifier));
		press("x");
		await waitFor(() => expect(useCommandStore.getState().selection).toEqual([identifier]));
	}, 30_000);
});
