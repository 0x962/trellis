import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { appContext } from "../../../test/appContext";
import { type FakeApp, installFakeApp } from "../../../test/fakeApp";
import { renders } from "../../../test/mocks/flash-list";
import type { TimelineRow } from "../Timeline";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

let app: FakeApp;

// One timeline page holds at most 100 items, newest first.
const pageSize = 100;

const oldComment = "Typecheck and tests are green on the PR. Ready for a look.";

const openTicket = async () => {
	await renderRouter(appContext(), { initialUrl: "/ticket/CDE-42" });
	await screen.findByText("Restore the fork pages after the upstream 1.27 merge");
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
	app.callsTo("timeline.list").filter((call) => (call.input as { before?: string }).before !== undefined);

describe("the ticket timeline history", () => {
	beforeEach(() => {
		app = installFakeApp();
	});

	// A full first page pushes the seeded comments of CDE-42 to the second
	// page. The list names the missing history and reads it on request.
	test("Load earlier reads the next timeline page and shows the older items", async () => {
		for (let n = 1; n <= pageSize + 1; n += 1) {
			await app.server.client.comments.create({ ticket: "CDE-42", body: `Note ${n}` });
		}
		await openTicket();
		await scrollToEnd();
		expect(timelineComments()).not.toContain(oldComment);
		await fireEvent.press(await screen.findByRole("button", { name: "Load earlier" }));
		await waitFor(() => expect(olderPageCalls()).toHaveLength(1));
		await waitFor(() => expect(timelineComments()).toContain(oldComment));
		expect(timelineComments()).toContain("Note 1");
		await waitFor(() => expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull());
	});

	test("a timeline that fits on one page offers no Load earlier", async () => {
		await openTicket();
		expect(await screen.findByText(oldComment)).toBeOnTheScreen();
		await scrollToEnd();
		expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull();
	});
});
