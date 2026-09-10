import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { appContext } from "../../../test/appContext";
import { type FakeApp, installFakeApp } from "../../../test/fakeApp";
import { tokens } from "../../theme/tokens";

let app: FakeApp;

const openTicket = async (identifier: string, title: string) => {
	const view = renderRouter(appContext(), { initialUrl: `/ticket/${identifier}` });
	await view;
	await screen.findByText(title);
	return view;
};

const open42 = () => openTicket("CDE-42", "Restore the fork pages after the upstream 1.27 merge");

const statusRow = () => screen.getByRole("button", { name: "Status" });
const approve = () => screen.queryByRole("button", { name: "Approve" });
const sendBack = () => screen.queryByRole("button", { name: "Send back" });

describe("the review actions", () => {
	beforeEach(() => {
		app = installFakeApp();
	});

	// O52. A fresh install is dark, so the primary button paints the dark accent.
	test("Approve is the primary button beside Send back on a human review ticket", async () => {
		await open42();
		expect(approve()).toHaveStyle({ backgroundColor: tokens.dark.accent });
		expect(sendBack()).toBeOnTheScreen();
		expect(sendBack()).not.toHaveStyle({ backgroundColor: tokens.dark.accent });
	});

	// O53. CDE-44 is In Progress; CDE-45 is Agent Review.
	test("the actions are absent on a started ticket and on an agent review ticket", async () => {
		const started = await openTicket("CDE-44", "Terminal pane loses scrollback on session handoff");
		expect(approve()).toBeNull();
		expect(sendBack()).toBeNull();
		await started.unmount();
		await openTicket("CDE-45", "Setup module skips a hand-run launchd agent");
		expect(within(statusRow()).getByText("Agent Review")).toBeOnTheScreen();
		expect(approve()).toBeNull();
		expect(sendBack()).toBeNull();
	});

	// O54.
	test("Approve moves the ticket to the lowest done status", async () => {
		const ticket = await app.server.client.tickets.get({ ticket: "CDE-42" });
		const { statuses } = await app.server.client.statuses.list({ project: ticket.project.id });
		const done = statuses.find((status) => status.slug === "done")!;
		await open42();
		await fireEvent.press(approve()!);
		await waitFor(() => expect(within(statusRow()).getByText("Done")).toBeOnTheScreen());
		await waitFor(() => expect(app.callsTo("tickets.update")).toHaveLength(1));
		const input = app.callsTo("tickets.update")[0]!.input as { status: string; expectedVersion: number };
		expect([done.id, done.slug]).toContain(input.status);
		expect(input.expectedVersion).toBe(ticket.version);
		await waitFor(() => expect(approve()).toBeNull());
		expect(sendBack()).toBeNull();
	});

	// O55.
	test("Send back asks for a comment, posts it, and moves the ticket to In Progress", async () => {
		await open42();
		await fireEvent.press(sendBack()!);
		const comment = await screen.findByLabelText("Comment");
		await fireEvent.changeText(comment, "Run the tests first");
		await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(app.callsTo("tickets.update")).toHaveLength(1));
		const writes = app.server.calls.filter(
			(call) =>
				call.path[0] === "comments" ||
				(call.path[0] === "tickets" &&
					(call.path[1] !== "get" || (call.input as { ticket: string }).ticket === "CDE-42")),
		);
		expect(writes.map((call) => call.path.join("."))).toEqual(["tickets.get", "comments.create", "tickets.update"]);
		expect(app.callsTo("comments.create")[0]!.input).toEqual({ ticket: "CDE-42", body: "Run the tests first" });
		await waitFor(() => expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen());
		expect(await screen.findByText("Run the tests first")).toBeOnTheScreen();
	});

	// O56.
	test("Send back stays open while the comment is empty", async () => {
		await open42();
		await fireEvent.press(sendBack()!);
		await screen.findByLabelText("Comment");
		await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
		await act(() => jest.advanceTimersByTimeAsync(50));
		expect(screen.getByLabelText("Comment")).toBeOnTheScreen();
		expect(within(statusRow()).getByText("Human Review")).toBeOnTheScreen();
		expect(app.callsTo("comments.create")).toHaveLength(0);
		expect(app.callsTo("tickets.update")).toHaveLength(0);
	});
});
