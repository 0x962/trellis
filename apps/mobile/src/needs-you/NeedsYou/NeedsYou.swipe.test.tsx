import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { errors } from "@trellis/api";
import { connect, failCalls, holdCalls } from "../../../test/connect";
import { callsTo, createFakeServer, type FakeServer, writes } from "../../../test/fakeServer";
import { bumpVersion } from "../../../test/inboxServers";
import { NotificationFeedbackType, notificationAsync } from "../../../test/mocks/expo-haptics";
import { renderNeedsYou, sectionHeader } from "../../../test/renderNeedsYou";
import { swipeLeft, swipeRight } from "../../../test/swipe";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

const prompt = "What should change?";
let server: FakeServer;
let restoreFetch = () => {};

const row = (identifier: string) => screen.queryByTestId(`inbox-row-${identifier}`);
const reviewCount = (count: string) => within(sectionHeader("Review")).getByText(count);

const renderSeeded = async () => {
	const view = await renderNeedsYou();
	await screen.findByTestId("inbox-row-CDE-42");
	return view;
};

const moveInput = (index: number) =>
	callsTo(server, "tickets.move")[index]!.input as { ticket: string; status: string; expectedVersion?: number };

// A 412 on the approve: the server row moved on without an event.
const conflict = async () => {
	await renderSeeded();
	bumpVersion(server, "CDE-42");
	await act(() => swipeRight("CDE-42"));
	expect(await screen.findByText("Cannot move CDE-42 to Done")).toBeOnTheScreen();
};

describe("NeedsYou swipes", () => {
	beforeEach(() => {
		server = createFakeServer();
		restoreFetch = connect(server);
	});

	afterEach(() => {
		restoreFetch();
	});

	// MI-26. The client speaks RPC, so the move is the `tickets.move` call
	// with CDE-42 and category:done, and no other write follows.
	test("a right swipe on a review row sends one move to the done status", async () => {
		await renderSeeded();
		await act(() => swipeRight("CDE-42"));
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(1));
		const input = moveInput(0);
		expect(input.status).toBe("category:done");
		const summary = (await server.client.tickets.get({ ticket: "CDE-42" })).id;
		expect([summary, "CDE-42"]).toContain(input.ticket);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(writes(server)).toHaveLength(1);
	});

	// MI-27
	test("approve removes the row before the server answers", async () => {
		await renderSeeded();
		const hold = holdCalls("tickets.move");
		await act(() => swipeRight("CDE-42"));
		await waitFor(() => expect(hold.state.held).toBe(1));
		await waitFor(() => expect(row("CDE-42")).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
		expect(callsTo(server, "tickets.move")).toHaveLength(0);
		hold.release();
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(1));
		expect(row("CDE-42")).toBeNull();
		expect(reviewCount("2")).toBeOnTheScreen();
	});

	// MI-28
	test("approve fires one success haptic", async () => {
		await renderSeeded();
		await act(() => swipeRight("CDE-42"));
		await waitFor(() => expect(notificationAsync).toHaveBeenCalledTimes(1));
		expect(notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success);
	});

	// MI-32
	test("a 412 restores the row and shows the conflict toast", async () => {
		await conflict();
		expect(screen.getByText(errors.VERSION_CONFLICT.message)).toBeOnTheScreen();
		expect(await screen.findByTestId("inbox-row-CDE-42")).toBeOnTheScreen();
		expect(reviewCount("3")).toBeOnTheScreen();
		expect((await server.client.tickets.get({ ticket: "CDE-42" })).status.slug).toBe("human-review");
	});

	// MI-33
	test("the toast Retry sends the move again with the current version", async () => {
		await conflict();
		const current = (await server.client.tickets.get({ ticket: "CDE-42" })).version;
		expect(moveInput(0).expectedVersion).toBe(current - 1);
		await fireEvent.press(within(screen.getByTestId("toast")).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(2));
		expect(moveInput(1).expectedVersion).toBe(current);
		expect(moveInput(1).status).toBe("category:done");
		await waitFor(() => expect(row("CDE-42")).toBeNull());
		expect((await server.client.tickets.get({ ticket: "CDE-42" })).status.category).toBe("done");
	});

	// MI-35
	test("a left swipe opens the send-back sheet and sends nothing", async () => {
		await renderSeeded();
		await act(() => swipeLeft("CDE-42"));
		expect(await screen.findByPlaceholderText(prompt)).toBeOnTheScreen();
		expect(writes(server)).toHaveLength(0);
		expect(row("CDE-42")).not.toBeNull();
	});

	// MI-36
	test("the send-back sheet posts the comment and then moves the ticket back", async () => {
		await renderSeeded();
		await act(() => swipeLeft("CDE-42"));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(1));
		const comments = callsTo(server, "comments.create");
		expect(comments).toHaveLength(1);
		expect((comments[0]!.input as { body: string }).body).toBe("Fix the failing typecheck");
		expect(server.calls.indexOf(comments[0]!)).toBeLessThan(server.calls.indexOf(callsTo(server, "tickets.move")[0]!));
		expect(moveInput(0).status).toBe("category:started");
		await waitFor(() => expect(screen.queryByPlaceholderText(prompt)).toBeNull());
		await waitFor(() => expect(row("CDE-42")).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
	});

	// MI-39
	test("a failed comment stops the send-back move", async () => {
		await renderSeeded();
		failCalls("comments.create");
		await act(() => swipeLeft("CDE-42"));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		const toast = await screen.findByTestId("toast");
		expect(within(toast).getByText(/CDE-42/)).toBeOnTheScreen();
		expect(callsTo(server, "tickets.move")).toHaveLength(0);
		expect(row("CDE-42")).not.toBeNull();
		expect(reviewCount("3")).toBeOnTheScreen();
	});

	// The row slides back to its place when the person cancels, so the red
	// reveal behind it is gone.
	test("Cancel on the send-back sheet puts the row back with no reveal", async () => {
		await renderSeeded();
		await act(() => swipeLeft("CDE-42"));
		await fireEvent.press(await screen.findByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByPlaceholderText(prompt)).toBeNull());
		await waitFor(() => expect(screen.queryByText("Send back")).toBeNull());
		expect(row("CDE-42")).not.toBeNull();
		expect(writes(server)).toHaveLength(0);
	});

	// The comment is on the server once it posts, so a Retry after a failed
	// move sends the move only.
	test("a failed move after the comment offers Retry, which moves the ticket without a second comment", async () => {
		await renderSeeded();
		const restore = failCalls("tickets.move");
		await act(() => swipeLeft("CDE-42"));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		const toast = await screen.findByTestId("toast");
		expect(within(toast).getByText("Cannot send back CDE-42")).toBeOnTheScreen();
		expect(callsTo(server, "comments.create")).toHaveLength(1);
		await waitFor(() => expect(row("CDE-42")).not.toBeNull());
		restore();
		await fireEvent.press(within(toast).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(1));
		expect(moveInput(0).status).toBe("category:started");
		expect(callsTo(server, "comments.create")).toHaveLength(1);
		await waitFor(() => expect(row("CDE-42")).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
	});

	// The sheet is closed when the write fails, so the Retry holds the comment.
	test("a failed comment offers Retry, which posts the same comment and moves the ticket", async () => {
		await renderSeeded();
		const restore = failCalls("comments.create");
		await act(() => swipeLeft("CDE-42"));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		const toast = await screen.findByTestId("toast");
		restore();
		await fireEvent.press(within(toast).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(1));
		const comments = callsTo(server, "comments.create");
		expect(comments).toHaveLength(1);
		expect((comments[0]!.input as { body: string }).body).toBe("Fix the failing typecheck");
		expect(moveInput(0).status).toBe("category:started");
		await waitFor(() => expect(row("CDE-42")).toBeNull());
	});
});
