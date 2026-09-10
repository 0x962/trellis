import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import { renders } from "../../../test/mocks/flash-list";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { human } from "../../../test/server";
import { lastComment, seedTicketScreen, type TicketData, title } from "../../../test/ticket";
import type { TimelineRow } from "../Timeline";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

let data: TicketData;
let net: Recorder;

// One timeline page holds at most 100 items, newest first. A comment adds
// its own activity line, so 50 comments fill one page.
const pageSize = 100;
const notes = pageSize / 2;

const openTicket = async () => {
	await renderRoute(`/ticket/${data.ticket}`);
	await screen.findByText(title);
};

// FlashList draws the rows that fit in its viewport. A scroll past the last
// row draws the end of the list and its footer.
const scrollToEnd = () =>
	fireEvent.scroll(screen.getByTestId("ticket-timeline"), {
		nativeEvent: {
			contentOffset: { x: 0, y: 100_000 },
			contentSize: { width: 400, height: 100_000 },
			layoutMeasurement: { width: 400, height: 900 },
		},
	});

// The comment bodies the timeline list holds, read from the props of its
// last render, because jest draws only the rows in the first viewport.
const timelineComments = () =>
	(renders.filter((props) => props.testID === "ticket-timeline").at(-1)!.data as readonly TimelineRow[]).flatMap(
		(row) => (row.kind === "comment" ? [row.comment.body] : []),
	);

const olderPageCalls = () =>
	net.callsTo("timeline.list").filter((call) => (call.input as { before?: string }).before !== undefined);

describe("the ticket timeline history", () => {
	beforeEach(async () => {
		data = await seedTicketScreen();
		net = connect();
	});

	afterEach(() => net.restore());

	// A first page of notes pushes the seeded comments and the activity of the
	// ticket to the second page. The list names the missing history and reads
	// it on request.
	test("Load earlier reads the next timeline page and shows the older items", async () => {
		for (let n = 1; n <= notes; n += 1) {
			await human.comments.create({ ticket: data.ticket, body: `Note ${n}` });
		}
		await openTicket();
		await scrollToEnd();
		expect(timelineComments()).not.toContain(lastComment);
		await fireEvent.press(await screen.findByRole("button", { name: "Load earlier" }));
		await waitFor(() => expect(olderPageCalls()).toHaveLength(1));
		await waitFor(() => expect(timelineComments()).toContain(lastComment));
		expect(timelineComments()).toContain("Note 1");
		await waitFor(() => expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull());
	});

	test("a timeline that fits on one page offers no Load earlier", async () => {
		await openTicket();
		expect(await screen.findByText(lastComment)).toBeOnTheScreen();
		await scrollToEnd();
		expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull();
	});
});
