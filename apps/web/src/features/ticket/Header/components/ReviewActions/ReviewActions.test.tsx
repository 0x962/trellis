import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { press } from "../../../../../../test/keyboard";
import { renderTicket, settle, statusOf } from "../../../../../../test/ticketHost";
import { ReviewActions } from "./ReviewActions";

beforeEach(() => localStorage.clear());

// A second done status placed before Done and a second started status
// placed before In Progress. Approve and Send back pick the lowest
// position of each category, so the new ones are the targets.
const withLowerStatuses = async () => {
	const server = createFakeServer();
	await server.client.statuses.create({ project: "CDE", name: "Shipped", category: "done" });
	await server.client.statuses.create({ project: "CDE", name: "Queued", category: "started" });
	await server.client.statuses.reorder({
		project: "CDE",
		statuses: ["todo", "queued", "in-progress", "agent-review", "human-review", "shipped", "done", "canceled"],
	});
	return server;
};

const mount = (identifier: string, server: FakeServer) =>
	renderTicket(identifier, (ticket) => <ReviewActions ticket={ticket} />, { path: `/t/${identifier}`, server });

const moves = (server: FakeServer) => server.callsTo("tickets.move");

describe("features/ticket/Header/components/ReviewActions", () => {
	// WT-96. CDE-42 sits in Human Review, whose reviewer is human.
	test("a human-reviewer status shows Approve and Send back", async () => {
		mount("CDE-42", createFakeServer());
		const approve = await screen.findByRole("button", { name: /Approve/ });
		const sendBack = screen.getByRole("button", { name: /Send back/ });
		expect(approve.textContent).toMatch(/\ba\b/);
		expect(sendBack.textContent).toMatch(/\br\b/);
	});

	// WT-97. CDE-45 sits in Agent Review; CDE-44 sits in In Progress.
	test("an agent-reviewer or non-review status hides the pair", async () => {
		for (const identifier of ["CDE-45", "CDE-44"]) {
			const server = createFakeServer();
			const view = mount(identifier, server);
			await waitFor(() => expect(server.callsTo("tickets.get")).toHaveLength(1));
			await settle();
			expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
			expect(screen.queryByRole("button", { name: /Send back/ })).toBeNull();
			view.unmount();
		}
	});

	// WT-98
	test("Approve moves to the lowest-position done status", async () => {
		const server = await withLowerStatuses();
		mount("CDE-42", server);
		await screen.findByRole("button", { name: /Approve/ });
		press("a");
		await waitFor(() => expect(moves(server)).toHaveLength(1));
		expect(statusOf(server.state.statuses.values(), moves(server)[0]!.input)!.name).toBe("Shipped");
	});

	// WT-99. Send back needs a reason: the comment goes first, then the move.
	test("Send back posts the comment and moves to the lowest-position started status", async () => {
		const user = userEvent.setup();
		const server = await withLowerStatuses();
		mount("CDE-42", server);
		await screen.findByRole("button", { name: /Send back/ });
		press("r");
		const box = await screen.findByRole("textbox", { name: "What should change?" });
		await user.type(box, "Rerun the tests");
		await user.click(screen.getByRole("button", { name: /^Send back$/ }));
		await waitFor(() => expect(server.callsTo("comments.create")).toHaveLength(1));
		expect((server.callsTo("comments.create")[0]!.input as { body: string }).body).toBe("Rerun the tests");
		await waitFor(() => expect(moves(server)).toHaveLength(1));
		expect(statusOf(server.state.statuses.values(), moves(server)[0]!.input)!.name).toBe("Queued");
	});

	// WT-100
	test("a cancelled Send back changes nothing", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		mount("CDE-42", server);
		await screen.findByRole("button", { name: /Send back/ });
		press("r");
		const box = await screen.findByRole("textbox", { name: "What should change?" });
		await user.type(box, "Half a thought");
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("textbox", { name: "What should change?" })).toBeNull());
		await settle();
		expect(server.callsTo("comments.create")).toHaveLength(0);
		expect(moves(server)).toHaveLength(0);
		const row = [...server.state.tickets.values()].find((entry) => entry.number === 42)!;
		expect(server.state.statuses.get(row.statusId)!.name).toBe("Human Review");
	});

	// WT-101. The hold keeps the move pending; the failure lands on release.
	test("a failed Approve rolls back and toasts with Retry", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const hold = server.holdNext("tickets.move");
		server.failNext("tickets.move", { code: "PROJECT_ARCHIVED" });
		const { queryClient, orpc } = mount("CDE-42", server);
		const key = orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		const cached = () => queryClient.getQueryData<Ticket>(key)!;
		await user.click(await screen.findByRole("button", { name: /Approve/ }));
		await waitFor(() => expect(cached().status.name).toBe("Done"));
		hold.release();
		await waitFor(() => expect(cached().status.name).toBe("Human Review"));
		const toast = await screen.findByText("The project is archived. Unarchive it before a change.");
		expect(within(toast.closest("li")!).getByRole("button", { name: "Retry" })).toBeDefined();
	});
});
