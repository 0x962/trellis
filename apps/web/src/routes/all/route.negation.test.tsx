import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { createFakeServer, type FakeServer } from "../../../test/fake-server";
import { renderApp } from "../../../test/renderWithProviders";
import { settle } from "../../../test/ticketHost";

beforeEach(() => localStorage.clear());

// The status lists that the reads of a route sent to the server.
const statusInputs = (server: FakeServer) =>
	["tickets.counts", "tickets.list", "tickets.board"]
		.flatMap((path) => server.callsTo(path))
		.map((call) => (call.input as { status?: string[] }).status)
		.filter((status) => status !== undefined);

describe("routes/all: a negated status", () => {
	// The API grammar has no negation. A negated status goes out as the rest
	// of every root's statuses, and the server answers 400 for an empty list.
	test("the table and the board send the rest of the statuses for status=!todo", async () => {
		for (const path of ["/all?status=!todo", "/all/board?status=!todo"]) {
			const server = createFakeServer();
			const view = renderApp({ path, actor: "navid", server });
			await screen.findByRole("heading", { name: "All tickets" });
			await waitFor(() => expect(server.callsTo("tickets.counts").length, path).toBeGreaterThan(0));
			await settle(100);
			const sent = statusInputs(server);
			expect(sent.length, path).toBeGreaterThan(0);
			for (const status of sent) {
				expect(status.length, path).toBeGreaterThan(0);
				expect(status, path).not.toContain("todo");
			}
			view.unmount();
			localStorage.clear();
		}
	});
});
