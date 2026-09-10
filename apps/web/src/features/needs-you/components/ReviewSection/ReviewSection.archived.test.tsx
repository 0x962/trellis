import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { focusRow, rowOf } from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { settle } from "../../../../../test/ticketHost";
import { ReviewSection } from "./ReviewSection";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const archivedServer = () => {
	const server = createFakeServer();
	[...server.state.projects.values()].find((entry) => entry.path === "CDE")!.archivedAt = new Date().toISOString();
	return server;
};

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<ReviewSection />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

const moves = (server: FakeServer) => server.calls.filter((call) => call.path.join(".") === "tickets.move");

describe("ReviewSection with a ticket of an archived project", () => {
	// The server refuses every write to a ticket under an archived project.
	// The row offers no action, and `a` sends no move and says why.
	test("the row offers no Approve, and a sends no move", async () => {
		const user = userEvent.setup();
		const server = archivedServer();
		render(server);
		const row = await rowOf("CDE-42");
		await focusRow("CDE-42");
		expect(row.querySelector("[data-approve]")).toBeNull();
		await user.keyboard("a");
		expect(await screen.findByText("CDE/web is archived. Unarchive the project to change it.")).toBeDefined();
		await settle(50);
		expect(moves(server)).toHaveLength(0);
		expect(document.querySelector('[data-inbox-row="CDE-42"]')).not.toBeNull();
	});

	// Send back writes a comment and a move. On an archived ticket, r opens
	// no box, because both writes would be refused.
	test("r opens no send-back box and names the project", async () => {
		const user = userEvent.setup();
		const server = archivedServer();
		render(server);
		await rowOf("CDE-42");
		await focusRow("CDE-42");
		await user.keyboard("r");
		expect(await screen.findByText("CDE/web is archived. Unarchive the project to change it.")).toBeDefined();
		await settle(50);
		expect(screen.queryByRole("textbox")).toBeNull();
	});
});
