import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { errors } from "@trellis/api";
import { fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { human, seeder } from "../../../test/server";
import { seedTicketScreen, type TicketData, title } from "../../../test/ticket";

let data: TicketData;
let net: Recorder;

const openTicket = async () => {
	await renderRoute(`/ticket/${data.ticket}`);
	await screen.findByText(title);
};

const statusRow = () => screen.getByRole("button", { name: "Status" });

const openSheet = async () => {
	await fireEvent.press(statusRow());
	return screen.findByTestId("status-sheet");
};

// The header texts inside the sheet, in render order.
const headings = (sheet: ReturnType<typeof screen.getByTestId>) =>
	within(sheet)
		.getAllByRole("header")
		.map((header) => header.props.children);

describe("the status sheet", () => {
	beforeEach(async () => {
		data = await seedTicketScreen(seeder);
		net = connect();
	});

	afterEach(() => net.restore());

	// O45. CDE.web inherits the six seeded statuses of CDE.
	test("the Status row opens the sheet with the effective statuses grouped by category", async () => {
		await openTicket();
		const sheet = await openSheet();
		expect(headings(sheet)).toEqual(["Todo", "Started", "Review", "Done", "Canceled"]);
		for (const name of ["Todo", "In Progress", "Agent Review", "Human Review", "Done", "Canceled"]) {
			expect(within(sheet).getByRole("radio", { name })).toBeOnTheScreen();
		}
		expect(within(sheet).getAllByRole("radio")).toHaveLength(6);
	});

	// O46.
	test("the sheet marks the current status and closes on a choice", async () => {
		await openTicket();
		const sheet = await openSheet();
		expect(within(sheet).getByRole("radio", { name: "Human Review" })).toBeChecked();
		expect(within(sheet).getByRole("radio", { name: "In Progress" })).not.toBeChecked();
		await fireEvent.press(within(sheet).getByRole("radio", { name: "In Progress" }));
		await waitFor(() => expect(screen.queryByTestId("status-sheet")).toBeNull());
	});

	// O47. The response waits behind the hold, so the grid shows the choice first.
	test("a choice patches the grid before the response and sends expectedVersion", async () => {
		const ticket = await human.tickets.get({ ticket: data.ticket });
		const { statuses } = await human.statuses.list({ project: ticket.project.id });
		const inProgress = statuses.find((status) => status.slug === "in-progress")!;
		await openTicket();
		const sheet = await openSheet();
		const hold = net.hold("tickets.update");
		await fireEvent.press(within(sheet).getByRole("radio", { name: "In Progress" }));
		await waitFor(() => expect(hold.state.held).toBe(1));
		expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen();
		hold.release();
		await waitFor(() => expect(net.callsTo("tickets.update")).toHaveLength(1));
		const input = net.callsTo("tickets.update")[0]!.input as {
			ticket: string;
			status: string;
			expectedVersion: number;
		};
		expect(input.ticket).toBe(data.ticket);
		expect([inProgress.id, inProgress.slug]).toContain(input.status);
		expect(input.expectedVersion).toBe(ticket.version);
		expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen();
	});

	// O48. Another client changes the ticket after the screen loaded it, so
	// the screen's expectedVersion is stale.
	test("a 412 rolls the grid back to the old status and shows the message", async () => {
		await openTicket();
		await human.tickets.update({ ticket: data.ticket, title: "Retitled from the web" });
		const sheet = await openSheet();
		await fireEvent.press(within(sheet).getByRole("radio", { name: "In Progress" }));
		expect(await screen.findByText(errors.VERSION_CONFLICT.message)).toBeOnTheScreen();
		await waitFor(() => expect(within(statusRow()).getByText("Human Review")).toBeOnTheScreen());
		expect(within(statusRow()).queryByText("In Progress")).toBeNull();
	});
});
