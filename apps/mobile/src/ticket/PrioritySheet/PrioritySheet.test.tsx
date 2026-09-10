import { beforeEach, describe, expect, test } from "@jest/globals";
import { errors } from "@trellis/api";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { appContext } from "../../../test/appContext";
import { type FakeApp, installFakeApp } from "../../../test/fakeApp";

let app: FakeApp;

const openTicket = async () => {
	await renderRouter(appContext(), { initialUrl: "/ticket/CDE-42" });
	await screen.findByText("Restore the fork pages after the upstream 1.27 merge");
};

const priorityRow = () => screen.getByRole("button", { name: "Priority" });

const openSheet = async () => {
	await fireEvent.press(priorityRow());
	return screen.findByTestId("priority-sheet");
};

describe("the priority sheet", () => {
	beforeEach(() => {
		app = installFakeApp();
	});

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
		const ticket = await app.server.client.tickets.get({ ticket: "CDE-42" });
		await openTicket();
		const sheet = await openSheet();
		const release = app.hold("tickets.update");
		await fireEvent.press(within(sheet).getByRole("radio", { name: "Urgent" }));
		await waitFor(() => expect(within(priorityRow()).getByText("Urgent")).toBeOnTheScreen());
		expect(app.callsTo("tickets.update")).toHaveLength(0);
		release();
		await waitFor(() => expect(app.callsTo("tickets.update")).toHaveLength(1));
		const input = app.callsTo("tickets.update")[0]!.input as {
			ticket: string;
			priority: string;
			expectedVersion: number;
		};
		expect(input.ticket).toBe("CDE-42");
		expect(input.priority).toBe("urgent");
		expect(input.expectedVersion).toBe(ticket.version);
		expect(within(priorityRow()).getByText("Urgent")).toBeOnTheScreen();
	});

	// O51.
	test("a 412 rolls the priority back and shows the message", async () => {
		await openTicket();
		await app.server.client.tickets.update({ ticket: "CDE-42", title: "Retitled from the web" });
		const sheet = await openSheet();
		await fireEvent.press(within(sheet).getByRole("radio", { name: "Urgent" }));
		expect(await screen.findByText(errors.VERSION_CONFLICT.message)).toBeOnTheScreen();
		await waitFor(() => expect(within(priorityRow()).getByText("High")).toBeOnTheScreen());
		expect(within(priorityRow()).queryByText("Urgent")).toBeNull();
	});
});
