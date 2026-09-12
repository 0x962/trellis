import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { renderApp } from "../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../server";
import { settle } from "../../../../../ticketHost";

beforeEach(() => localStorage.clear());

// The status lists that the reads of a route sent to the server.
const statusInputs = (server: TestServer) =>
	["tickets.counts", "tickets.list", "tickets.board"]
		.flatMap((path) => server.callsTo(path))
		.map((call) => (call.input as { status?: string[] }).status)
		.filter((status) => status !== undefined);

describe("routes/p/$: a negated status", () => {
	// The API grammar has no negation. A negated status goes out as the rest
	// of the project's statuses, and the server answers 400 for an empty list.
	test("the table and the board send the rest of the statuses for status=!todo", async () => {
		for (const path of ["/p/CDE/table?status=!todo", "/p/CDE/board?status=!todo"]) {
			const server = createTestServer();
			const view = renderApp({ path, actor: "dana", server });
			await screen.findByRole("radiogroup", { name: "View" });
			await waitFor(() => expect(server.callsTo("tickets.counts").length, path).toBeGreaterThan(0));
			await settle(100);
			const sent = statusInputs(server);
			expect(sent.length, path).toBeGreaterThan(0);
			for (const status of sent) {
				expect(status.length, path).toBeGreaterThan(0);
				expect(status, path).not.toContain("todo");
			}
			expect(screen.queryByText("Something went wrong"), path).toBeNull();
			view.unmount();
			localStorage.clear();
		}
	});
});
