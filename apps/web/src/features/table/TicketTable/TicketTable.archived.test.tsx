import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../test/renderWithProviders";
import { archiveProject } from "../../../../test/rows";
import { createTestServer } from "../../../../test/server";
import { calls, findGrid, focusRow, resetUi, rowOf, sleep, toastWith } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

afterEach(() => act(resetUi));

describe("features/table/TicketTable with a ticket of an archived project", () => {
	// All tickets lists the tickets of an archived project too. The server
	// refuses a write to them, so the table sends none and says why.
	test("a priority change on the row sends no write and names the project", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await archiveProject(server, "CDE");
		renderApp({ path: "/all/table?status=human-review", actor: "navid", server });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		focusRow("CDE-42");
		await user.keyboard("p");
		await user.click(await screen.findByRole("option", { name: /High/ }));
		await toastWith(/is archived\. Unarchive the project to change it\./);
		await sleep(50);
		expect(calls(server, "tickets.update")).toHaveLength(0);
		expect(calls(server, "tickets.updateMany")).toHaveLength(0);
	});
});
