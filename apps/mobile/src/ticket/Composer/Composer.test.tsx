import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { appContext } from "../../../test/appContext";
import { failCalls } from "../../../test/connect";
import { type FakeApp, installFakeApp } from "../../../test/fakeApp";

// The composer posts through the typed client, so the tests run the whole
// route against the fake server.
let app: FakeApp;

const openTicket = async () => {
	await renderRouter(appContext(), { initialUrl: "/ticket/CDE-42" });
	await screen.findByText("Restore the fork pages after the upstream 1.27 merge");
};

const field = () => screen.getByLabelText("Add a comment");
const send = () => screen.getByRole("button", { name: "Send" });

describe("the comment composer", () => {
	beforeEach(() => {
		app = installFakeApp();
	});

	// O42.
	test("the Send button posts comments.create with the ticket and the body", async () => {
		await openTicket();
		await fireEvent.changeText(field(), "Looks good");
		await fireEvent.press(send());
		await waitFor(() => expect(app.callsTo("comments.create")).toHaveLength(1));
		expect(app.callsTo("comments.create")[0]!.input).toEqual({ ticket: "CDE-42", body: "Looks good" });
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
		await act(() => jest.advanceTimersByTimeAsync(50));
		expect(app.callsTo("comments.create")).toHaveLength(0);
	});

	// A failed post leaves the text in the field, so the person loses nothing.
	test("a failed post keeps the text editable and Retry posts it", async () => {
		await openTicket();
		const restore = failCalls("comments.create");
		await fireEvent.changeText(field(), "Looks good");
		await fireEvent.press(send());
		expect(await screen.findByText("Cannot post the comment")).toBeOnTheScreen();
		expect(field().props.value).toBe("Looks good");
		expect(field().props.editable).toBe(true);
		expect(send()).toBeEnabled();
		restore();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(app.callsTo("comments.create")).toHaveLength(1));
		expect(app.callsTo("comments.create")[0]!.input).toEqual({ ticket: "CDE-42", body: "Looks good" });
		await waitFor(() => expect(field().props.value).toBe(""));
		expect(screen.queryByText("Cannot post the comment")).toBeNull();
	});
});
