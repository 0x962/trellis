import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { human, seeder } from "../../../test/server";
import { settle } from "../../../test/settle";
import { agentReviewTitle, seedTicketScreen, startedTitle, type TicketData, title } from "../../../test/ticket";
import { tokens } from "../../theme/tokens";

let data: TicketData;
let net: Recorder;

const openTicket = async (identifier: string, heading: string) => {
	const view = await renderRoute(`/ticket/${identifier}`);
	await screen.findByText(heading);
	return view;
};

const openReview = () => openTicket(data.ticket, title);

const statusRow = () => screen.getByRole("button", { name: "Status" });
const approve = () => screen.queryByRole("button", { name: "Approve" });
const sendBack = () => screen.queryByRole("button", { name: "Send back" });

describe("the review actions", () => {
	beforeEach(async () => {
		data = await seedTicketScreen(seeder);
		net = connect();
	});

	afterEach(() => net.restore());

	// O52. A fresh install is dark, so the primary button paints the dark accent.
	test("Approve is the primary button beside Send back on a human review ticket", async () => {
		await openReview();
		expect(approve()).toHaveStyle({ backgroundColor: tokens.dark.accent });
		expect(sendBack()).toBeOnTheScreen();
		expect(sendBack()).not.toHaveStyle({ backgroundColor: tokens.dark.accent });
	});

	// O53. One ticket is In Progress; the other one is Agent Review.
	test("the actions are absent on a started ticket and on an agent review ticket", async () => {
		const started = await openTicket(data.started, startedTitle);
		expect(approve()).toBeNull();
		expect(sendBack()).toBeNull();
		await started.unmount();
		await openTicket(data.agentReview, agentReviewTitle);
		expect(within(statusRow()).getByText("Agent Review")).toBeOnTheScreen();
		expect(approve()).toBeNull();
		expect(sendBack()).toBeNull();
	});

	// O54. The seeded set has no status between Human Review and Done.
	test("Approve moves the ticket to the status after Human Review", async () => {
		const ticket = await human.tickets.get({ ticket: data.ticket });
		const { statuses } = await human.statuses.list({ project: ticket.project.id });
		const done = statuses.find((status) => status.slug === "done")!;
		await openReview();
		await fireEvent.press(approve()!);
		await waitFor(() => expect(within(statusRow()).getByText("Done")).toBeOnTheScreen());
		await waitFor(() => expect(net.callsTo("tickets.update")).toHaveLength(1));
		const input = net.callsTo("tickets.update")[0]!.input as { status: string; expectedVersion: number };
		expect([done.id, done.slug]).toContain(input.status);
		expect(input.expectedVersion).toBe(ticket.version);
		await waitFor(() => expect(approve()).toBeNull());
		expect(sendBack()).toBeNull();
	});

	// O55.
	test("Send back asks for a comment, posts it, and moves the ticket to In Progress", async () => {
		await openReview();
		await fireEvent.press(sendBack()!);
		const comment = await screen.findByLabelText("Comment");
		await fireEvent.changeText(comment, "Run the tests first");
		await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(net.callsTo("tickets.update")).toHaveLength(1));
		const writes = net.calls.filter(
			(call) =>
				call.procedure.startsWith("comments.") ||
				(call.procedure.startsWith("tickets.") &&
					(call.procedure !== "tickets.get" || (call.input as { ticket: string }).ticket === data.ticket)),
		);
		expect(writes.map((call) => call.procedure)).toEqual(["tickets.get", "comments.create", "tickets.update"]);
		expect(net.callsTo("comments.create")[0]!.input).toEqual({ ticket: data.ticket, body: "Run the tests first" });
		await waitFor(() => expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen());
		expect(await screen.findByText("Run the tests first")).toBeOnTheScreen();
	});

	// O56.
	test("Send back stays open while the comment is empty", async () => {
		await openReview();
		await fireEvent.press(sendBack()!);
		await screen.findByLabelText("Comment");
		await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
		await settle();
		expect(screen.getByLabelText("Comment")).toBeOnTheScreen();
		expect(within(statusRow()).getByText("Human Review")).toBeOnTheScreen();
		expect(net.callsTo("comments.create")).toHaveLength(0);
		expect(net.callsTo("tickets.update")).toHaveLength(0);
	});
});
