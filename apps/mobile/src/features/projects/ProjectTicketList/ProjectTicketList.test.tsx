import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { applyEvent } from "@trellis/api";
import { type BrowseData, seedBrowse } from "../../../../test/browse";
import { connect } from "../../../../test/connect";
import { failureMessage, type Recorder } from "../../../../test/record";
import { renderWithClient } from "../../../../test/renderWithClient";
import { human, serverHost } from "../../../../test/server";
import { queryClient } from "../../../lib/queryClient";
import { ProjectTicketList } from "./ProjectTicketList";

let data: BrowseData;
let net: Recorder;

beforeEach(async () => {
	data = await seedBrowse();
	net = connect();
});

afterEach(() => net.restore());

// A ULID for the batch every event carries.
const batchId = "01J8Z6X4Q3M2K1H0G9F8E7D6C5";

// The identifiers on screen, top to bottom.
const shown = () =>
	screen.queryAllByTestId(/^ticket-row-/).map((row) => (row.props.testID as string).replace("ticket-row-", ""));

// FlashList draws a first batch of rows, then fills the viewport on a later
// layout pass. The wait ends when the list draws rows and the count holds for
// three polls of waitFor in a row.
const waitForRows = async () => {
	const counts: number[] = [];
	await waitFor(() => {
		counts.push(shown().length);
		const lastThree = counts.slice(-3);
		expect(lastThree).toHaveLength(3);
		expect(lastThree[0]).toBeGreaterThan(0);
		expect(new Set(lastThree).size).toBe(1);
	});
};

// The first page the list requests: the Active segment, sorted by Updated.
const firstPage = () =>
	human.tickets.list({ project: data.root, category: ["todo", "started"], sort: "-updatedAt", limit: 25 });

// Scrolls the list past its last row, so FlashList draws the rows at the end.
const scrollToEnd = () =>
	fireEvent.scroll(screen.getByTestId("ticket-list"), {
		nativeEvent: {
			contentOffset: { x: 0, y: 10_000 },
			contentSize: { width: 400, height: 10_000 },
			layoutMeasurement: { width: 400, height: 900 },
		},
	});

describe("the ticket list", () => {
	// The setup gives FlashList a 900 px viewport, so the list draws only the
	// rows that fit. These rows are the top of the server's page, in order.
	test("the list renders the server's page in the server's order", async () => {
		const page = await firstPage();

		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		const drawn = shown();
		expect(drawn.length).toBeLessThan(page.items.length);
		expect(drawn).toEqual(page.items.slice(0, drawn.length).map((item) => item.identifier));
	});

	// A row of the next page is drawn only after a scroll to the list end.
	test("the next page appends below the rows already shown", async () => {
		const pageOne = new Set((await firstPage()).items.map((item) => item.identifier));
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();
		const first = shown();

		await fireEvent(screen.getByTestId("ticket-list"), "endReached");
		// The next page request carries the cursor of the first page.
		await waitFor(() =>
			expect(net.callsTo("tickets.list").some((call) => "cursor" in (call.input as object))).toBe(true),
		);
		expect(shown()).toEqual(first);

		await scrollToEnd();
		await waitFor(() => expect(shown().some((identifier) => !pageOne.has(identifier))).toBe(true));
		const all = shown();
		expect(new Set(all).size).toBe(all.length);
	});

	test("a segment with no ticket shows an empty state", async () => {
		// The small root holds no ticket in a review status.
		renderWithClient(<ProjectTicketList project={data.small} />);
		await waitForRows();

		await fireEvent.press(screen.getByLabelText("Review"));
		await waitFor(() => expect(screen.getByText(/no tickets/i)).toBeOnTheScreen());
		expect(shown()).toEqual([]);
	});

	// A list the server did not send is not an empty list.
	test("a refused list shows the server's reason, and Retry loads the list", async () => {
		const restore = net.fail("tickets.list");
		await renderWithClient(<ProjectTicketList project={data.root} />);
		expect(await screen.findByText(failureMessage)).toBeOnTheScreen();
		expect(screen.queryByText("No tickets here")).toBeNull();
		expect(screen.queryByText(`Cannot reach ${serverHost}`)).toBeNull();
		restore();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await waitForRows();
		expect(screen.queryByText(failureMessage)).toBeNull();
	});

	// A request that gets no answer carries no reason from the server, so the
	// screen names the host and offers the server actions.
	test("a list that reaches no server shows the unreachable state", async () => {
		const restore = net.reject("tickets.list");
		await renderWithClient(<ProjectTicketList project={data.root} />);
		expect(await screen.findByText(`Cannot reach ${serverHost}`)).toBeOnTheScreen();
		expect(screen.queryByText("No tickets here")).toBeNull();
		restore();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await waitForRows();
		expect(screen.queryByText(`Cannot reach ${serverHost}`)).toBeNull();
	});

	test("the controls start at Active and Updated", async () => {
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		expect(screen.getByLabelText("Active").props.accessibilityState).toMatchObject({ checked: true });
		expect(screen.getByLabelText("Review").props.accessibilityState).toMatchObject({ checked: false });
		expect(screen.getByLabelText("Done").props.accessibilityState).toMatchObject({ checked: false });
		expect(screen.getByLabelText("Updated").props.accessibilityState).toMatchObject({ checked: true });
		expect(screen.getByLabelText("Priority").props.accessibilityState).toMatchObject({ checked: false });
	});

	test("a ticket event patches the row in place without a refetch", async () => {
		const target = (await firstPage()).items[0]!;

		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitFor(() => expect(screen.getByText(target.title)).toBeOnTheScreen());
		expect(net.callsTo("tickets.list")).toHaveLength(1);

		const summary = { ...target, title: "The row title the event carries", version: target.version + 1 };
		await act(() => applyEvent({ type: "ticket.updated", summary, fields: ["title"], batchId }, queryClient));

		await waitFor(() => expect(screen.getByText(summary.title)).toBeOnTheScreen());
		expect(net.callsTo("tickets.list")).toHaveLength(1);
	});
});
