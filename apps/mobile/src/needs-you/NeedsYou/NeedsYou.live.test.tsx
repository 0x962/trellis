import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, screen, waitFor, within } from "@testing-library/react-native";
import type { Ticket, TicketSummary } from "@trellis/api";
import { connect } from "../../../test/connect";
import { ulid } from "../../../test/fixtures";
import { type InboxData, seedInbox } from "../../../test/inbox";
import { instances } from "../../../test/mocks/react-native-sse";
import type { Recorder } from "../../../test/record";
import { renderNeedsYou, sectionHeader } from "../../../test/renderNeedsYou";
import { human } from "../../../test/server";
import { settle } from "../../../test/settle";
import { swipeRight } from "../../../test/swipe";
import { startLive } from "../../lib/live";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

let data: InboxData;
let net: Recorder;
let stopLive = () => {};

const first = () => data.review[0]!;
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
	await screen.findByTestId(`inbox-row-${first()}`);
	stopLive = startLive(view.queryClient);
	expect(instances).toHaveLength(1);
	return view;
};

describe("NeedsYou live updates", () => {
	beforeEach(async () => {
		data = await seedInbox();
		net = connect();
	});

	afterEach(() => {
		stopLive();
		net.restore();
	});

	// MI-51. A title is a row field: the cache patches, no list refetches.
	test("a title event patches the row without a refetch", async () => {
		await renderLive();
		const current = summaryOf(await human.tickets.get({ ticket: first() }));
		const fetches = net.callsTo("inbox.get").length;
		await emit("ticket.updated", { ...current, title: "A newer title", version: current.version + 1 }, ["title"]);
		expect(await screen.findByText("A newer title")).toBeOnTheScreen();
		await settle(1_300);
		expect(net.callsTo("inbox.get")).toHaveLength(fetches);
	});

	// MI-52
	test("an older event never patches the row", async () => {
		await renderLive();
		const current = summaryOf(await human.tickets.get({ ticket: first() }));
		await emit("ticket.updated", { ...current, title: "An older title" }, ["title"]);
		await emit("ticket.updated", { ...current, title: "An even older title", version: current.version - 1 }, ["title"]);
		await settle(200);
		expect(screen.queryByText("An older title")).toBeNull();
		expect(screen.queryByText("An even older title")).toBeNull();
		expect(within(row(first())!).getByText(current.title)).toBeOnTheScreen();
	});

	// MI-53. A status change alters membership, so the inbox refetches once
	// after the 1 s coalescer window.
	test("a status event refetches the inbox once through the coalescer", async () => {
		await renderLive();
		const fetches = net.callsTo("inbox.get").length;
		const moved = await human.tickets.move({ ticket: first(), status: "in-progress" });
		await emit("ticket.updated", summaryOf(moved), ["status", "position"]);
		expect(net.callsTo("inbox.get")).toHaveLength(fetches);
		await waitFor(() => expect(net.callsTo("inbox.get")).toHaveLength(fetches + 1), { timeout: 3_000 });
		await waitFor(() => expect(row(first())).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
		await settle(300);
		expect(net.callsTo("inbox.get")).toHaveLength(fetches + 1);
	});

	// MI-54
	test("a delete event drops the row from its section", async () => {
		await renderLive();
		const gone = summaryOf(await human.tickets.get({ ticket: data.review[1]! }));
		await human.tickets.delete({ ticket: data.review[1]! });
		await emit("ticket.deleted", gone, []);
		await waitFor(() => expect(row(data.review[1]!)).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
		expect(row(first())).not.toBeNull();
	});

	// MI-55. An event that lands while the approve is in flight waits for
	// the response and applies in version order, so a stale summary never
	// shows.
	test("an event during an approve applies after the response", async () => {
		await renderLive();
		const before = summaryOf(await human.tickets.get({ ticket: first() }));
		const hold = net.hold("tickets.move");
		await act(() => swipeRight(first()));
		await waitFor(() => expect(hold.state.held).toBe(1));
		await emit("ticket.updated", { ...before, title: "A stale title", version: before.version + 1 }, ["title"]);
		await settle(50);
		expect(screen.queryByText("A stale title")).toBeNull();
		hold.release();
		await waitFor(() => expect(net.callsTo("tickets.move")).toHaveLength(1));
		await settle(200);
		expect(screen.queryByText("A stale title")).toBeNull();
		expect(row(first())).toBeNull();
		expect(reviewCount("2")).toBeOnTheScreen();
	});
});
