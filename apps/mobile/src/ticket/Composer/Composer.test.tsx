import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";
import { settle } from "../../../test/settle";
import { seedTicketScreen, type TicketData, title } from "../../../test/ticket";

// The composer posts through the typed client, so the tests run the whole
// route against the real server.
let data: TicketData;
let net: Recorder;

const openTicket = async () => {
	await renderRoute(`/ticket/${data.ticket}`);
	await screen.findByText(title);
};

const field = () => screen.getByLabelText("Add a comment");
const send = () => screen.getByRole("button", { name: "Send" });

describe("the comment composer", () => {
	beforeEach(async () => {
		data = await seedTicketScreen();
		net = connect();
	});

	afterEach(() => net.restore());

	// O42.
	test("the Send button posts comments.create with the ticket and the body", async () => {
		await openTicket();
		await fireEvent.changeText(field(), "Looks good");
		await fireEvent.press(send());
		await waitFor(() => expect(net.callsTo("comments.create")).toHaveLength(1));
		expect(net.callsTo("comments.create")[0]!.input).toEqual({ ticket: data.ticket, body: "Looks good" });
	});

	// O43.
	test("the composer clears after the post and the comment shows in the timeline", async () => {
		await openTicket();
		await fireEvent.changeText(field(), "Looks good");
		await fireEvent.press(send());
		await waitFor(() => expect(field().props.value).toBe(""));
		expect(await screen.findByText("Looks good")).toBeOnTheScreen();
	});

	// O44.
	test("the Send button is disabled while the field holds no text", async () => {
		await openTicket();
		expect(send()).toBeDisabled();
		await fireEvent.changeText(field(), "   ");
		expect(send()).toBeDisabled();
		await fireEvent.press(send());
		await settle();
		expect(net.callsTo("comments.create")).toHaveLength(0);
	});

	// A failed post leaves the text in the field, so the person loses nothing.
	test("a failed post keeps the text editable and Retry posts it", async () => {
		await openTicket();
		const restore = net.fail("comments.create");
		await fireEvent.changeText(field(), "Looks good");
		await fireEvent.press(send());
		expect(await screen.findByText("Cannot post the comment")).toBeOnTheScreen();
		expect(field().props.value).toBe("Looks good");
		expect(field().props.editable).toBe(true);
		expect(send()).toBeEnabled();
		restore();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(net.callsTo("comments.create")).toHaveLength(2));
		expect(net.callsTo("comments.create")[1]!.input).toEqual({ ticket: data.ticket, body: "Looks good" });
		await waitFor(() => expect(field().props.value).toBe(""));
		expect(screen.queryByText("Cannot post the comment")).toBeNull();
	});
});
