import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, screen, waitFor, within } from "@testing-library/react-native";
import type { Ticket, TicketSummary } from "@trellis/api";
import { connect, holdCalls } from "../../../test/connect";
import { callsTo, createFakeServer, type FakeServer } from "../../../test/fakeServer";
import { ulid } from "../../../test/fixtures";
import { instances } from "../../../test/mocks/react-native-sse";
import { renderNeedsYou, sectionHeader } from "../../../test/renderNeedsYou";
import { swipeRight } from "../../../test/swipe";
import { startLive } from "../../lib/live";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

let server: FakeServer;
let restoreFetch = () => {};
let stopLive = () => {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const row = (identifier: string) => screen.queryByTestId(`inbox-row-${identifier}`);
const reviewCount = (count: string) => within(sectionHeader("Review")).getByText(count);

// The summary inside a `tickets.get` or `tickets.move` answer.
const summaryOf = ({ description, children, prs, attachments, ...summary }: Ticket): TicketSummary => summary;

// Delivers one ticket event over the shell's stream, the way the server does.
const emit = (type: "ticket.updated" | "ticket.deleted", summary: TicketSummary, fields: string[]) =>
	act(() => {
		instances[0]!.emit(type, JSON.stringify({ summary, fields, batchId: ulid }));
	});

const renderLive = async () => {
	const view = await renderNeedsYou();
	await screen.findByTestId("inbox-row-CDE-42");
	stopLive = startLive(view.queryClient);
	expect(instances).toHaveLength(1);
	return view;
};

describe("NeedsYou live updates", () => {
	beforeEach(() => {
		server = createFakeServer();
		restoreFetch = connect(server);
	});

	afterEach(() => {
		stopLive();
		restoreFetch();
	});

	// MI-51. A title is a row field: the cache patches, no list refetches.
	test("a title event patches the row without a refetch", async () => {
		await renderLive();
		const current = summaryOf(await server.client.tickets.get({ ticket: "CDE-42" }));
		const fetches = callsTo(server, "inbox.get").length;
		await emit(
			"ticket.updated",
			{ ...current, title: "Restore the fork pages, take two", version: current.version + 1 },
			["title"],
		);
		expect(await screen.findByText("Restore the fork pages, take two")).toBeOnTheScreen();
		await sleep(1_300);
		expect(callsTo(server, "inbox.get")).toHaveLength(fetches);
	});

	// MI-52
	test("an older event never patches the row", async () => {
		await renderLive();
		const current = summaryOf(await server.client.tickets.get({ ticket: "CDE-42" }));
		await emit("ticket.updated", { ...current, title: "An older title" }, ["title"]);
		await emit("ticket.updated", { ...current, title: "An even older title", version: current.version - 1 }, ["title"]);
		await sleep(200);
		expect(screen.queryByText("An older title")).toBeNull();
		expect(screen.queryByText("An even older title")).toBeNull();
		expect(within(row("CDE-42")!).getByText(current.title)).toBeOnTheScreen();
	});

	// MI-53. A status change alters membership, so the inbox refetches once
	// after the 1 s coalescer window.
	test("a status event refetches the inbox once through the coalescer", async () => {
		await renderLive();
		const fetches = callsTo(server, "inbox.get").length;
		const moved = await server.client.tickets.move({ ticket: "CDE-42", status: "in-progress" });
		await emit("ticket.updated", summaryOf(moved), ["status", "position"]);
		expect(callsTo(server, "inbox.get")).toHaveLength(fetches);
		await waitFor(() => expect(callsTo(server, "inbox.get")).toHaveLength(fetches + 1), { timeout: 3_000 });
		await waitFor(() => expect(row("CDE-42")).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
		await sleep(300);
		expect(callsTo(server, "inbox.get")).toHaveLength(fetches + 1);
	});

	// MI-54
	test("a delete event drops the row from its section", async () => {
		await renderLive();
		const gone = summaryOf(await server.client.tickets.get({ ticket: "CDE-37" }));
		await server.client.tickets.delete({ ticket: "CDE-37" });
		await emit("ticket.deleted", gone, []);
		await waitFor(() => expect(row("CDE-37")).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
		expect(row("CDE-42")).not.toBeNull();
	});

	// MI-55. An event that lands while the approve is in flight waits for
	// the response and applies in version order, so a stale summary never
	// shows.
	test("an event during an approve applies after the response", async () => {
		await renderLive();
		const before = summaryOf(await server.client.tickets.get({ ticket: "CDE-42" }));
		const hold = holdCalls("tickets.move");
		await act(() => swipeRight("CDE-42"));
		await waitFor(() => expect(hold.state.held).toBe(1));
		await emit("ticket.updated", { ...before, title: "A stale title", version: before.version + 1 }, ["title"]);
		await sleep(50);
		expect(screen.queryByText("A stale title")).toBeNull();
		hold.release();
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(1));
		await sleep(200);
		expect(screen.queryByText("A stale title")).toBeNull();
		expect(row("CDE-42")).toBeNull();
		expect(reviewCount("2")).toBeOnTheScreen();
	});
});
