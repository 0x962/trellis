import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import { applyEvent, type Ticket } from "@trellis/api";
import { Toaster } from "@trellis/ui";
import { deletedEvent, summaryOf, updatedEvent } from "../../../../test/events";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { patchTicket } from "../../../../test/rows";
import { createTestServer } from "../../../../test/server";
import { fieldValue, renderTicket, settle } from "../../../../test/ticketHost";
import { TicketPeek } from "../TicketPeek";
import { PeekListProvider } from "../TicketPeek/providers/PeekListProvider";
import { TicketView } from "./TicketView";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

// The page for CDE-42 at version 17, with the detail in the cache.
const page = async () => {
	const server = createTestServer();
	await patchTicket(server, "CDE-42", { version: 17 });
	const view = renderTicket("CDE-42", (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
		path: "/t/CDE-42",
		server,
	});
	await screen.findByLabelText("Ticket header");
	await waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());
	const key = view.orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
	const cached = () => view.queryClient.getQueryData<Ticket>(key)!;
	return { ...view, server, key, cached };
};

const statusNamed = (server: ReturnType<typeof createTestServer>, name: string) => {
	const status = [...server.state.statuses.values()].find((entry) => entry.name === name)!;
	return {
		id: status.id,
		slug: status.slug,
		name: status.name,
		category: status.category,
		reviewer: status.reviewer,
		color: status.color,
	};
};

describe("features/ticket/TicketView live", () => {
	// WT-103. A newer event patches the open page in place.
	test("a ticket.updated event patches the open page without a refetch", async () => {
		const { server, queryClient, cached } = await page();
		const before = cached();
		expect(before.version).toBe(17);
		const gets = server.callsTo("tickets.get").length;
		const summary = {
			...summaryOf(before as unknown as Record<string, unknown>),
			version: 18,
			title: "Restore every fork page",
			status: statusNamed(server, "In Progress"),
			updatedAt: new Date().toISOString(),
		};
		act(() => applyEvent(updatedEvent(summary, ["title", "status"]), queryClient));
		await waitFor(() =>
			expect(fieldValue(screen.getByRole("textbox", { name: "Title" }))).toBe("Restore every fork page"),
		);
		const rail = screen.getByLabelText("Properties");
		expect(within(rail).getByText("In Progress")).toBeDefined();
		const header = screen.getByLabelText("Ticket header");
		expect(within(header).queryByRole("button", { name: /Approve/ })).toBeNull();
		const updated = within(rail)
			.getAllByRole("term")
			.find((term) => term.textContent === "Updated")!.nextElementSibling!;
		expect(updated.textContent).toMatch(/just now|now|\b\d+s/);
		expect(cached().version).toBe(18);
		await settle(400);
		expect(server.callsTo("tickets.get")).toHaveLength(gets);
	});

	// WT-104
	test("an older event never changes the open page", async () => {
		const { queryClient, cached } = await page();
		const before = cached();
		const summary = { ...summaryOf(before as unknown as Record<string, unknown>), version: 16, title: "Old" };
		act(() => applyEvent(updatedEvent(summary, ["title"]), queryClient));
		await settle();
		expect(fieldValue(screen.getByRole("textbox", { name: "Title" }))).toBe(before.title);
		expect(cached().version).toBe(17);
	});

	// WT-105. The event carries no text, so the page keeps what it has,
	// marks it stale, and lets one coalesced refetch replace it.
	test("a description event marks the detail stale and the refetch clears it", async () => {
		const { server, queryClient, cached } = await page();
		const before = cached();
		const gets = server.callsTo("tickets.get").length;
		await server.clientAs("agent:claude-code").tickets.update({
			ticket: "CDE-42",
			description: "The agent rewrote this.",
		});
		await patchTicket(server, "CDE-42", { version: 18 });
		const summary = { ...summaryOf(before as unknown as Record<string, unknown>), version: 18 };
		act(() => applyEvent(updatedEvent(summary, ["description"]), queryClient));
		expect(document.querySelector(".markdown")!.textContent).toContain("1.27");
		expect(cached().descriptionStale).toBe(true);
		await waitFor(() => expect(server.callsTo("tickets.get")).toHaveLength(gets + 1), { timeout: 2000 });
		await waitFor(() => expect(document.querySelector(".markdown")!.textContent).toContain("The agent rewrote this."));
		expect(cached().descriptionStale).toBeUndefined();
		await settle(400);
		expect(server.callsTo("tickets.get")).toHaveLength(gets + 1);
	});

	// WT-106
	test("a delete event closes the peek", async () => {
		const server = createTestServer();
		const { router, queryClient } = renderWithProviders(
			<PeekListProvider rows={[{ identifier: "CDE-42", visible: true }]}>
				<TicketPeek />
				<Toaster />
			</PeekListProvider>,
			{ path: "/p/CDE?peek=CDE-42", actor: "navid", server },
		);
		await screen.findByRole("dialog", { name: "CDE-42" });
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		act(() => applyEvent(deletedEvent(summaryOf(ticket as unknown as Record<string, unknown>)), queryClient));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
	});
});
