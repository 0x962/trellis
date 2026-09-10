import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { errors } from "@trellis/api";
import { fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { human } from "../../../test/server";
import { seedTicketScreen, type TicketData, title } from "../../../test/ticket";

let data: TicketData;
let net: Recorder;

const openTicket = async () => {
	await renderRoute(`/ticket/${data.ticket}`);
	await screen.findByText(title);
};

const priorityRow = () => screen.getByRole("button", { name: "Priority" });

const openSheet = async () => {
	await fireEvent.press(priorityRow());
	return screen.findByTestId("priority-sheet");
};

describe("the priority sheet", () => {
	beforeEach(async () => {
		data = await seedTicketScreen();
		net = connect();
	});

	afterEach(() => net.restore());

	// O49.
	test("the Priority row opens the sheet with the five priorities and marks High", async () => {
		await openTicket();
		const sheet = await openSheet();
		const radios = within(sheet).getAllByRole("radio");
		expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual(["Urgent", "High", "Medium", "Low", "None"]);
		expect(within(sheet).getByRole("radio", { name: "High" })).toBeChecked();
		expect(within(sheet).getByRole("radio", { name: "Urgent" })).not.toBeChecked();
	});

	// O50. The response waits behind the hold, so the grid shows the choice first.
	test("a choice patches the grid before the response", async () => {
		const ticket = await human.tickets.get({ ticket: data.ticket });
		await openTicket();
		const sheet = await openSheet();
		const hold = net.hold("tickets.update");
		await fireEvent.press(within(sheet).getByRole("radio", { name: "Urgent" }));
		await waitFor(() => expect(hold.state.held).toBe(1));
		expect(within(priorityRow()).getByText("Urgent")).toBeOnTheScreen();
		hold.release();
		await waitFor(() => expect(net.callsTo("tickets.update")).toHaveLength(1));
		const input = net.callsTo("tickets.update")[0]!.input as {
			ticket: string;
			priority: string;
			expectedVersion: number;
		};
		expect(input.ticket).toBe(data.ticket);
		expect(input.priority).toBe("urgent");
		expect(input.expectedVersion).toBe(ticket.version);
		expect(within(priorityRow()).getByText("Urgent")).toBeOnTheScreen();
	});

	// O51.
	test("a 412 rolls the priority back and shows the message", async () => {
		await openTicket();
		await human.tickets.update({ ticket: data.ticket, title: "Retitled from the web" });
		const sheet = await openSheet();
		await fireEvent.press(within(sheet).getByRole("radio", { name: "Urgent" }));
		expect(await screen.findByText(errors.VERSION_CONFLICT.message)).toBeOnTheScreen();
		await waitFor(() => expect(within(priorityRow()).getByText("High")).toBeOnTheScreen());
		expect(within(priorityRow()).queryByText("Urgent")).toBeNull();
	});
});
