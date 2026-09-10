import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { applyEvent } from "@trellis/api";
import { ticketSummary } from "../../../../../web/test/fake-server/summaries";
import { callsTo, type FakeServer, startFakeServer, stopFakeServer } from "../../../../test/fakeServer";
import { renderWithClient } from "../../../../test/renderWithClient";
import { queryClient } from "../../../lib/queryClient";
import { ProjectTicketList } from "./ProjectTicketList";

let server: FakeServer;

beforeEach(() => {
	server = startFakeServer();
});

afterEach(() => stopFakeServer(server));

// A ULID for the batch every event carries.
const batchId = "01J8Z6X4Q3M2K1H0G9F8E7D6C5";

// The identifiers on screen, top to bottom.
const shown = () =>
	screen.queryAllByTestId(/^ticket-row-/).map((row) => (row.props.testID as string).replace("ticket-row-", ""));

const waitForRows = () => waitFor(() => expect(shown().length).toBeGreaterThan(0));

// The first page the list requests: the Active segment, sorted by Updated.
const firstPage = () =>
	server.client.tickets.list({ project: "CDE", category: ["todo", "started"], sort: "-updatedAt", limit: 25 });

// Scrolls the list past its last row, so FlashList draws the rows at the end.
const scrollToEnd = () =>
	fireEvent.scroll(screen.getByTestId("ticket-list"), {
		nativeEvent: {
			contentOffset: { x: 0, y: 10_000 },
			contentSize: { width: 400, height: 10_000 },
			layoutMeasurement: { width: 400, height: 900 },
		},
	});

const ticketRow = (identifier: string) => {
	const number = Number(identifier.split("-")[1]);
	const key = identifier.split("-")[0];
	return [...server.state.tickets.values()].find(
		(row) => row.number === number && server.state.projects.get(row.rootId)!.key === key,
	)!;
};

describe("the ticket list", () => {
	// The setup gives FlashList a 900 px viewport, so the list draws only the
	// rows that fit. These rows are the top of the server's page, in order.
	test("the list renders the server's page in the server's order", async () => {
		const page = await firstPage();

		renderWithClient(<ProjectTicketList project="CDE" />);
		await waitForRows();

		const drawn = shown();
		expect(drawn.length).toBeLessThan(page.items.length);
		expect(drawn).toEqual(page.items.slice(0, drawn.length).map((item) => item.identifier));
	});

	// A row of the next page is drawn only after a scroll to the list end.
	test("the next page appends below the rows already shown", async () => {
		const pageOne = new Set((await firstPage()).items.map((item) => item.identifier));
		renderWithClient(<ProjectTicketList project="CDE" />);
		await waitForRows();
		const first = shown();

		await fireEvent(screen.getByTestId("ticket-list"), "endReached");
		// The next page request carries the cursor of the first page.
		await waitFor(() =>
			expect(callsTo(server, "tickets.list").some((call) => "cursor" in (call.input as object))).toBe(true),
		);
		expect(shown()).toEqual(first);

		await scrollToEnd();
		await waitFor(() => expect(shown().some((identifier) => !pageOne.has(identifier))).toBe(true));
		const all = shown();
		expect(new Set(all).size).toBe(all.length);
	});

	test("a segment with no ticket shows an empty state", async () => {
		// MRG holds no ticket in a review status.
		renderWithClient(<ProjectTicketList project="MRG" />);
		await waitForRows();

		await fireEvent.press(screen.getByLabelText("Review"));
		await waitFor(() => expect(screen.getByText(/no tickets/i)).toBeOnTheScreen());
		expect(shown()).toEqual([]);
	});

	test("the controls start at Active and Updated", async () => {
		renderWithClient(<ProjectTicketList project="CDE" />);
		await waitForRows();

		expect(screen.getByLabelText("Active").props.accessibilityState).toMatchObject({ checked: true });
		expect(screen.getByLabelText("Review").props.accessibilityState).toMatchObject({ checked: false });
		expect(screen.getByLabelText("Done").props.accessibilityState).toMatchObject({ checked: false });
		expect(screen.getByLabelText("Updated").props.accessibilityState).toMatchObject({ checked: true });
		expect(screen.getByLabelText("Priority").props.accessibilityState).toMatchObject({ checked: false });
	});

	test("a ticket event patches the row in place without a refetch", async () => {
		const row = ticketRow("CDE-44");
		row.version = 3;

		renderWithClient(<ProjectTicketList project="CDE" />);
		await waitFor(() => expect(screen.getByText(row.title)).toBeOnTheScreen());
		expect(callsTo(server, "tickets.list")).toHaveLength(1);

		row.title = "Terminal pane keeps its scrollback on a session handoff";
		row.version = 4;
		const summary = ticketSummary(server.state, row);
		await act(() => applyEvent({ type: "ticket.updated", summary, fields: ["title"], batchId }, queryClient));

		await waitFor(() => expect(screen.getByText(row.title)).toBeOnTheScreen());
		expect(callsTo(server, "tickets.list")).toHaveLength(1);
	});
});
