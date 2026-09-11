import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { commentEvent } from "../../../../test/events";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { addActivity, findTicket } from "../../../../test/fake-server/state";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { ago, minute, renderTicket } from "../../../../test/ticketHost";
import { Timeline } from "./Timeline";

beforeEach(() => localStorage.clear());

const mount = (identifier: string, server: FakeServer) =>
	renderTicket(identifier, (ticket) => <Timeline ticket={ticket} />, { path: `/t/${identifier}`, server });

const list = () => screen.findByRole("list", { name: "Timeline" });
const items = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>("[data-kind]")];
const kinds = (element: HTMLElement) => items(element).map((item) => item.getAttribute("data-kind"));

// Three activity rows by claude-code, one minute apart, on CDE-45.
const runOfThree = (server: FakeServer) => {
	const ticket = findTicket(server.state, "CDE-45")!;
	const base = {
		rootId: ticket.rootId,
		projectId: ticket.projectId,
		ticketId: ticket.id,
		actor: { name: "claude-code", kind: "agent" as const },
		action: "ticket.updated",
	};
	addActivity(server.state, {
		...base,
		field: "status",
		fromValue: "Todo",
		toValue: "In Progress",
		createdAt: ago(3 * minute),
	});
	addActivity(server.state, {
		...base,
		field: "priority",
		fromValue: "medium",
		toValue: "high",
		createdAt: ago(2 * minute),
	});
	// The server writes a PR link with no field and the URL in `meta`.
	addActivity(server.state, {
		...base,
		action: "pr.linked",
		field: null,
		fromValue: null,
		toValue: null,
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
	// The API pages newest first. The Activity stream shows each item oldest first.
	test("interleaves activity and comments in one chronological stream", async () => {
		const server = createFakeServer();
		const page = await server.client.timeline.list({ ticket: "CDE-42" });
		expect(page.items[0]!.createdAt > page.items[page.items.length - 1]!.createdAt).toBe(true);
		mount("CDE-42", server);
		const element = await list();
		await waitFor(() => expect(items(element)).toHaveLength(page.items.length));
		const activity = within(element).getByRole("list", { name: "Activity" });
		expect(within(element).queryByRole("list", { name: "Comments" })).toBeNull();
		const streamKinds = [...activity.querySelectorAll<HTMLElement>(":scope > [data-stream-entry]")].map((item) =>
			item.getAttribute("data-stream-entry"),
		);
		expect(streamKinds).toContain("comment");
		expect(streamKinds).toContain("activity");
		expect(streamKinds.indexOf("comment")).toBeLessThan(streamKinds.lastIndexOf("activity"));
		expect(streamKinds.lastIndexOf("activity")).toBeLessThan(streamKinds.lastIndexOf("comment"));
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
		const server = createFakeServer();
		runOfThree(server);
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
		const server = createFakeServer();
		const ticket = findTicket(server.state, "CDE-45")!;
		const posted = await server.client.comments.create({ ticket: "CDE-45", body: "Tests are green now." });
		addActivity(server.state, {
			rootId: ticket.rootId,
			projectId: ticket.projectId,
			ticketId: ticket.id,
			actor: { name: "navid", kind: "human" },
			action: "comment.created",
			field: null,
			fromValue: null,
			toValue: null,
			meta: { commentId: posted.id },
			createdAt: posted.createdAt,
		});
		mount("CDE-45", server);
		const element = await list();
		await within(element).findByText("Tests are green now.");
		expect(lineTexts(element).some((text) => text.includes("changed the ticket"))).toBe(false);
		expect(lineTexts(element).some((text) => text.includes("comment"))).toBe(false);
	});

	// Every activity row shows. There is no toggle to hide the older ones.
	test("shows every activity entry with no toggle", async () => {
		mount("CDE-42", createFakeServer());
		await list();
		expect(screen.queryByRole("button", { name: /activity/i })).toBeNull();
	});

	// WT-87. The stream loads newest first; the older page prepends once.
	test("Load older pages the timeline with the cursor", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const ticket = await server.client.tickets.create({ project: "CDE", title: "Long thread" });
		for (let index = 0; index < 105; index++) {
			await server.client.comments.create({ ticket: ticket.identifier, body: `Comment ${index}` });
		}
		const first = await server.client.timeline.list({ ticket: ticket.identifier });
		expect(first.nextCursor).toBeString();
		mount(ticket.identifier, server);
		const element = await list();
		await waitFor(() => expect(items(element)).toHaveLength(100));
		const before = server.callsTo("timeline.list").length;
		await user.click(screen.getByRole("button", { name: "Load older" }));
		await waitFor(() => expect(server.callsTo("timeline.list")).toHaveLength(before + 1));
		expect((server.callsTo("timeline.list")[before]!.input as { before?: string }).before).toBe(first.nextCursor!);
		await waitFor(() => expect(items(element)).toHaveLength(106));
		expect(kinds(element)[0]).toBe("activity");
		expect(items(element)[0]!.textContent).toContain("created");
		expect(screen.queryByRole("button", { name: "Load older" })).toBeNull();
	});

	// WT-88. A comment event carries only the ids. One coalesced
	// `timeline.list` for this ticket brings the card. The fake clock drives
	// the coalescer.
	test("a comment event refreshes only this ticket's timeline", async () => {
		const server = createFakeServer();
		const { queryClient } = mount("CDE-42", server);
		const element = await list();
		await waitFor(() => expect(kinds(element).filter((kind) => kind === "comment")).toHaveLength(4));
		const clock = createFakeScheduler();
		const applier = createEventApplier(queryClient, { scheduler: clock.scheduler });
		const ticket = findTicket(server.state, "CDE-42")!;
		const posted = await server.clientAs("agent:claude-code").comments.create({
			ticket: "CDE-42",
			body: "Tests are green now.",
		});
		const lists = server.callsTo("timeline.list");
		act(() => applier.applyEvent(commentEvent("comment.created", { ...ticket, identifier: "CDE-42" }, posted)));
		act(() => clock.advanceTo(1000));
		await waitFor(() => expect(within(element).getByText("Tests are green now.")).toBeDefined());
		const fetched = server.callsTo("timeline.list").slice(lists.length);
		expect(fetched).toHaveLength(1);
		expect((fetched[0]!.input as { ticket: string }).ticket).toBe("CDE-42");
		expect(kinds(element)[kinds(element).length - 1]).toBe("comment");
	});
});
