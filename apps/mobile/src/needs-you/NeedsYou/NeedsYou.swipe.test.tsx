import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { errors } from "@trellis/api";
import { connect } from "../../../test/connect";
import { bumpVersion, type InboxData, seedInbox } from "../../../test/inbox";
import { NotificationFeedbackType, notificationAsync } from "../../../test/mocks/expo-haptics";
import type { Recorder } from "../../../test/record";
import { renderNeedsYou, sectionHeader } from "../../../test/renderNeedsYou";
import { human } from "../../../test/server";
import { settle } from "../../../test/settle";
import { swipeLeft, swipeRight } from "../../../test/swipe";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

const prompt = "What should change?";
let data: InboxData;
let net: Recorder | undefined;

// The first row of Review, which every swipe acts on.
const first = () => data.review[0]!;

const row = (identifier: string) => screen.queryByTestId(`inbox-row-${identifier}`);
const reviewCount = (count: string) => within(sectionHeader("Review")).getByText(count);

const renderSeeded = async () => {
	const view = await renderNeedsYou();
	await screen.findByTestId(`inbox-row-${first()}`);
	return view;
};

const moveInput = (index: number) =>
	net!.callsTo("tickets.move")[index]!.input as { ticket: string; status: string; expectedVersion?: number };

// A 412 on the approve: the server row moved on without an event.
const conflict = async () => {
	await renderSeeded();
	await bumpVersion(first());
	await act(() => swipeRight(first()));
	expect(await screen.findByText(`Cannot move ${first()} to Done`)).toBeOnTheScreen();
};

describe("NeedsYou swipes", () => {
	beforeEach(async () => {
		data = await seedInbox();
		net = connect();
	});

	afterEach(() => {
		net?.restore();
		net = undefined;
	});

	// MI-26. The client speaks RPC, so the move is the `tickets.move` call
	// with the review row and category:done, and no other write follows.
	test("a right swipe on a review row sends one move to the done status", async () => {
		await renderSeeded();
		await act(() => swipeRight(first()));
		await waitFor(() => expect(net!.callsTo("tickets.move")).toHaveLength(1));
		const input = moveInput(0);
		expect(input.status).toBe("category:done");
		const id = (await human.tickets.get({ ticket: first() })).id;
		expect([id, first()]).toContain(input.ticket);
		await settle(100);
		expect(net!.writes()).toHaveLength(1);
	});

	// MI-27
	test("approve removes the row before the server answers", async () => {
		await renderSeeded();
		const hold = net!.hold("tickets.move");
		await act(() => swipeRight(first()));
		await waitFor(() => expect(hold.state.held).toBe(1));
		await waitFor(() => expect(row(first())).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
		hold.release();
		await waitFor(() => expect(net!.callsTo("tickets.move")).toHaveLength(1));
		expect(row(first())).toBeNull();
		expect(reviewCount("2")).toBeOnTheScreen();
	});

	// MI-28
	test("approve fires one success haptic", async () => {
		await renderSeeded();
		await act(() => swipeRight(first()));
		await waitFor(() => expect(notificationAsync).toHaveBeenCalledTimes(1));
		expect(notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success);
	});

	// MI-32
	test("a 412 restores the row and shows the conflict toast", async () => {
		await conflict();
		expect(screen.getByText(errors.VERSION_CONFLICT.message)).toBeOnTheScreen();
		expect(await screen.findByTestId(`inbox-row-${first()}`)).toBeOnTheScreen();
		expect(reviewCount("3")).toBeOnTheScreen();
		expect((await human.tickets.get({ ticket: first() })).status.slug).toBe("human-review");
	});

	// MI-33
	test("the toast Retry sends the move again with the current version", async () => {
		await conflict();
		const current = (await human.tickets.get({ ticket: first() })).version;
		expect(moveInput(0).expectedVersion).toBe(current - 1);
		await fireEvent.press(within(screen.getByTestId("toast")).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(net!.callsTo("tickets.move")).toHaveLength(2));
		expect(moveInput(1).expectedVersion).toBe(current);
		expect(moveInput(1).status).toBe("category:done");
		await waitFor(() => expect(row(first())).toBeNull());
		expect((await human.tickets.get({ ticket: first() })).status.category).toBe("done");
	});

	// MI-35
	test("a left swipe opens the send-back sheet and sends nothing", async () => {
		await renderSeeded();
		await act(() => swipeLeft(first()));
		expect(await screen.findByPlaceholderText(prompt)).toBeOnTheScreen();
		expect(net!.writes()).toHaveLength(0);
		expect(row(first())).not.toBeNull();
	});

	// MI-36
	test("the send-back sheet posts the comment and then moves the ticket back", async () => {
		await renderSeeded();
		await act(() => swipeLeft(first()));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		await waitFor(() => expect(net!.callsTo("tickets.move")).toHaveLength(1));
		const comments = net!.callsTo("comments.create");
		expect(comments).toHaveLength(1);
		expect((comments[0]!.input as { body: string }).body).toBe("Fix the failing typecheck");
		expect(net!.calls.indexOf(comments[0]!)).toBeLessThan(net!.calls.indexOf(net!.callsTo("tickets.move")[0]!));
		expect(moveInput(0).status).toBe("category:started");
		await waitFor(() => expect(screen.queryByPlaceholderText(prompt)).toBeNull());
		await waitFor(() => expect(row(first())).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
	});

	// MI-39
	test("a failed comment stops the send-back move", async () => {
		await renderSeeded();
		net!.fail("comments.create");
		await act(() => swipeLeft(first()));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		const toast = await screen.findByTestId("toast");
		expect(within(toast).getByText(new RegExp(first()))).toBeOnTheScreen();
		expect(net!.callsTo("tickets.move")).toHaveLength(0);
		expect(row(first())).not.toBeNull();
		expect(reviewCount("3")).toBeOnTheScreen();
	});

	// The row slides back to its place when the person cancels, so the red
	// reveal behind it is gone.
	test("Cancel on the send-back sheet puts the row back with no reveal", async () => {
		await renderSeeded();
		await act(() => swipeLeft(first()));
		await fireEvent.press(await screen.findByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByPlaceholderText(prompt)).toBeNull());
		await waitFor(() => expect(screen.queryByText("Send back")).toBeNull());
		expect(row(first())).not.toBeNull();
		expect(net!.writes()).toHaveLength(0);
	});

	// The comment is on the server once it posts, so a Retry after a failed
	// move sends the move only.
	test("a failed move after the comment offers Retry, which moves the ticket without a second comment", async () => {
		await renderSeeded();
		const restore = net!.fail("tickets.move");
		await act(() => swipeLeft(first()));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		const toast = await screen.findByTestId("toast");
		expect(within(toast).getByText(`Cannot send back ${first()}`)).toBeOnTheScreen();
		expect(net!.callsTo("comments.create")).toHaveLength(1);
		await waitFor(() => expect(row(first())).not.toBeNull());
		restore();
		await fireEvent.press(within(toast).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(net!.callsTo("tickets.move")).toHaveLength(2));
		expect(moveInput(1).status).toBe("category:started");
		expect(net!.callsTo("comments.create")).toHaveLength(1);
		await waitFor(() => expect(row(first())).toBeNull());
		expect(reviewCount("2")).toBeOnTheScreen();
	});

	// The sheet is closed when the write fails, so the Retry holds the comment.
	test("a failed comment offers Retry, which posts the same comment and moves the ticket", async () => {
		await renderSeeded();
		const restore = net!.fail("comments.create");
		await act(() => swipeLeft(first()));
		await fireEvent.changeText(await screen.findByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Send back" }));
		const toast = await screen.findByTestId("toast");
		restore();
		await fireEvent.press(within(toast).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(net!.callsTo("tickets.move")).toHaveLength(1));
		const comments = net!.callsTo("comments.create");
		expect(comments).toHaveLength(2);
		expect((comments[1]!.input as { body: string }).body).toBe("Fix the failing typecheck");
		expect(moveInput(0).status).toBe("category:started");
		await waitFor(() => expect(row(first())).toBeNull());
	});
});
