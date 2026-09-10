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
	beforeEach(() => {
		app = installFakeApp();
	});

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
		const ticket = await app.server.client.tickets.get({ ticket: "CDE-42" });
		const { statuses } = await app.server.client.statuses.list({ project: ticket.project.id });
		const inProgress = statuses.find((status) => status.slug === "in-progress")!;
		await openTicket();
		const sheet = await openSheet();
		const release = app.hold("tickets.update");
		await fireEvent.press(within(sheet).getByRole("radio", { name: "In Progress" }));
		await waitFor(() => expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen());
		expect(app.callsTo("tickets.update")).toHaveLength(0);
		release();
		await waitFor(() => expect(app.callsTo("tickets.update")).toHaveLength(1));
		const input = app.callsTo("tickets.update")[0]!.input as {
			ticket: string;
			status: string;
			expectedVersion: number;
		};
		expect(input.ticket).toBe("CDE-42");
		expect([inProgress.id, inProgress.slug]).toContain(input.status);
		expect(input.expectedVersion).toBe(ticket.version);
		expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen();
	});

	// O48. Another client changes the ticket after the screen loaded it, so
	// the screen's expectedVersion is stale.
	test("a 412 rolls the grid back to the old status and shows the message", async () => {
		await openTicket();
		await app.server.client.tickets.update({ ticket: "CDE-42", title: "Retitled from the web" });
		const sheet = await openSheet();
		await fireEvent.press(within(sheet).getByRole("radio", { name: "In Progress" }));
		expect(await screen.findByText(errors.VERSION_CONFLICT.message)).toBeOnTheScreen();
		await waitFor(() => expect(within(statusRow()).getByText("Human Review")).toBeOnTheScreen());
		expect(within(statusRow()).queryByText("In Progress")).toBeNull();
	});
});
