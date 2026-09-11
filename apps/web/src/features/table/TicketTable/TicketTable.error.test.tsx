import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderApp } from "../../../../test/renderWithProviders";
import { findGrid, resetUi, rows } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(600);

beforeEach(() => {
	resetUi();
	installViewport();
});

describe("features/table/TicketTable: a failed load", () => {
	// A failed first page must not read as a project with no open work. The
	// error names the server's message, and Retry loads the rows.
	test("shows the error with the server's message and a Retry that loads the rows", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		server.failNext("tickets.list", { code: "NOT_FOUND", data: { ref: "CDE" } });
		renderApp({ path: "/p/CDE/table", actor: "navid", server });
		expect(await screen.findByText("The tickets did not load.")).toBeDefined();
		expect(screen.getByText(/No row matches the ref/)).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Retry" }));
		await findGrid();
		await waitFor(() => expect(rows().length).toBeGreaterThan(0));
		expect(screen.queryByText("The tickets did not load.")).toBeNull();
	});
});
