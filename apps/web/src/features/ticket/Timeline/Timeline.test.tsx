import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { addActivity, ticketId } from "../../../../test/rows";
import { createTestServer, type TestServer } from "../../../../test/server";
import { ago, minute, renderTicket } from "../../../../test/ticketHost";
import { Timeline } from "./Timeline";

beforeEach(() => localStorage.clear());

const mount = (identifier: string, server: TestServer) =>
	renderTicket(identifier, (ticket) => <Timeline ticket={ticket} />, { path: `/t/${identifier}`, server });

const list = () => screen.findByRole("list", { name: "Timeline" });
const items = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>("[data-kind]")];
const kinds = (element: HTMLElement) => items(element).map((item) => item.getAttribute("data-kind"));

// Three activity rows by claude-code, one minute apart, on CDE-45.
const runOfThree = async (server: TestServer) => {
	const base = {
		ticket: "CDE-45",
		actor: { name: "claude-code", kind: "agent" as const },
		action: "ticket.updated",
	};
	await addActivity(server, {
		...base,
		field: "status",
		fromValue: "Todo",
		toValue: "In Progress",
		createdAt: ago(3 * minute),
	});
	await addActivity(server, {
		...base,
		field: "priority",
		fromValue: "medium",
		toValue: "high",
		createdAt: ago(2 * minute),
	});
	// The server writes a PR link with no field and the URL in `meta`.
	await addActivity(server, {
		...base,
		action: "pr.linked",
		meta: { url: "https://github.com/canary-technologies-corp/de/pull/118" },
		createdAt: ago(minute),
	});
};

// The text of every activity line, with the whitespace collapsed.
const lineTexts = (element: HTMLElement) =>
	items(element)
		.filter((item) => item.getAttribute("data-kind") === "activity")
		.map((item) => item.textContent!.replace(/\s+/g, " "));

describe("features/ticket/Timeline", () => {
	// WT-76. The server answers newest first. The page paints oldest first,
	// and the newest item is the last thing before the composer.
	test("renders the timeline oldest first under the newest item", async () => {
		const server = createTestServer();
		const page = await server.client.timeline.list({ ticket: "CDE-42" });
		expect(page.items[0]!.createdAt > page.items[page.items.length - 1]!.createdAt).toBe(true);
		mount("CDE-42", server);
		const element = await list();
		// The page holds the activity row the server writes beside each
		// comment, and the card already shows that event, so the list draws
		// fewer lines than the page holds.
		await waitFor(() => expect(items(element).length).toBeGreaterThan(0));
		await within(element).findByText("Typecheck and tests are green on the PR. Ready for a look.");
		const stamps = items(element).map((item) => item.querySelector("time")!.getAttribute("datetime")!);
		expect(stamps).toEqual([...stamps].sort());
		const newest = items(element)[items(element).length - 1]!;
		expect(newest.textContent).toContain("Typecheck and tests are green on the PR.");
		const composer = screen.getByRole("textbox", { name: "Comment" });
		expect(newest.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
		const between = items(element).filter(
			(item) => item.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(between).toHaveLength(items(element).length - 1);
	});

	// WT-80. Three changes by one agent inside five minutes read as one
	// line; the line opens to the three rows.
	test("collapses a same-actor run and expands it on click", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await runOfThree(server);
		mount("CDE-45", server);
		const element = await list();
		const summary = await within(element).findByText(/changed the status and priority, and linked the PR de #118/);
		const line = summary.closest<HTMLElement>("[data-kind]")!;
		expect(line.textContent).toContain("3 changes");
		expect(lineTexts(element).some((text) => text.includes("moved the ticket from Todo to In Progress"))).toBe(false);
		await user.click(within(line).getByRole("button", { name: /3 changes/ }));
		await waitFor(() =>
			expect(lineTexts(element).some((text) => text.includes("moved the ticket from Todo to In Progress"))).toBe(true),
		);
		expect(within(element).getByText(/set the priority to High/)).toBeDefined();
		expect(within(element).getByText(/linked the PR de #118/)).toBeDefined();
	});

	// TK-1. The server writes a `comment.created` row beside each comment.
	// The comment card already shows the event, so the row draws no line.
	test("a comment's own activity row draws no line beside the card", async () => {
		const server = createTestServer();
		const posted = await server.client.comments.create({ ticket: "CDE-45", body: "Tests are green now." });
		await addActivity(server, {
			ticket: "CDE-45",
			actor: { name: "navid", kind: "human" },
			action: "comment.created",
			meta: { commentId: posted.id },
			createdAt: posted.createdAt,
		});
		mount("CDE-45", server);
		const element = await list();
		await within(element).findByText("Tests are green now.");
		expect(lineTexts(element).some((text) => text.includes("changed the ticket"))).toBe(false);
		expect(lineTexts(element).some((text) => text.includes("comment"))).toBe(false);
	});

	// WT-86
	test("the Comments toggle hides the activity lines", async () => {
		const user = userEvent.setup();
		mount("CDE-42", createTestServer());
		const element = await list();
		await waitFor(() => expect(kinds(element)).toContain("activity"));
		await user.click(screen.getByRole("button", { name: "Comments" }));
		expect(screen.getByRole("button", { name: "Comments" }).getAttribute("aria-pressed")).toBe("true");
		await waitFor(() => expect(kinds(element)).not.toContain("activity"));
		expect(kinds(element).filter((kind) => kind === "comment")).toHaveLength(4);
	});

	// WT-87. The stream loads newest first; the older page prepends once.
	test("Load older pages the timeline with the cursor", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const ticket = await server.client.tickets.create({ project: "CDE", title: "Long thread" });
		for (let index = 0; index < 105; index++) {
			await server.client.comments.create({ ticket: ticket.identifier, body: `Comment ${index}` });
		}
		const first = await server.client.timeline.list({ ticket: ticket.identifier });
		expect(first.nextCursor).toBeString();
		mount(ticket.identifier, server);
		const element = await list();
		await waitFor(() => expect(items(element).length).toBeGreaterThan(0));
		const shown = items(element).length;
		const before = server.callsTo("timeline.list").length;
		await user.click(screen.getByRole("button", { name: "Load older" }));
		await waitFor(() => expect(server.callsTo("timeline.list")).toHaveLength(before + 1));
		expect((server.callsTo("timeline.list")[before]!.input as { before?: string }).before).toBe(first.nextCursor!);
		await waitFor(() => expect(items(element).length).toBeGreaterThan(shown));
		// Every further page goes out the same way, and the button goes when
		// the oldest row, the creation, is on the page.
		for (let page = screen.queryByRole("button", { name: "Load older" }); page !== null; ) {
			await user.click(page);
			await waitFor(() => expect(screen.queryByRole("button", { name: "Load older" })).not.toBe(page));
			page = screen.queryByRole("button", { name: "Load older" });
		}
		expect(kinds(element)[0]).toBe("activity");
		expect(items(element)[0]!.textContent).toContain("created");
		expect(screen.queryByRole("button", { name: "Load older" })).toBeNull();
	});

	// WT-88. A comment event carries only the ids. One coalesced
	// `timeline.list` for this ticket brings the card. The fake clock drives
	// the coalescer.
	test("a comment event refreshes only this ticket's timeline", async () => {
		const server = createTestServer();
		const { queryClient } = mount("CDE-42", server);
		const element = await list();
		await waitFor(() => expect(kinds(element).filter((kind) => kind === "comment")).toHaveLength(4));
		const clock = createFakeScheduler();
		const applier = createEventApplier(queryClient, { scheduler: clock.scheduler });
		const id = await ticketId(server, "CDE-42");
		const posted = await server.clientAs("agent:claude-code").comments.create({
			ticket: "CDE-42",
			body: "Tests are green now.",
		});
		const lists = server.callsTo("timeline.list");
		act(() => applier.applyEvent({ type: "comment.created", id: posted.id, ticketId: id }));
		act(() => clock.advanceTo(1000));
		await waitFor(() => expect(within(element).getByText("Tests are green now.")).toBeDefined());
		const fetched = server.callsTo("timeline.list").slice(lists.length);
		expect(fetched).toHaveLength(1);
		expect((fetched[0]!.input as { ticket: string }).ticket).toBe("CDE-42");
		expect(kinds(element)[kinds(element).length - 1]).toBe("comment");
	});
});
