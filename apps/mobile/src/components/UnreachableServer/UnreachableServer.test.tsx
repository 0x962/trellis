import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { connect, disconnect } from "../../../test/connect";
import { callsTo, createFakeServer, serverHost } from "../../../test/fakeServer";
import { renderNeedsYou, sectionHeader } from "../../../test/renderNeedsYou";
import { UnreachableServer } from "./UnreachableServer";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

let restoreFetch = () => {};

describe("UnreachableServer", () => {
	afterEach(() => {
		restoreFetch();
	});

	test("the screen names the host and offers the two actions", async () => {
		const onRetry = jest.fn();
		const onChangeServer = jest.fn();
		await render(<UnreachableServer host={serverHost} onRetry={onRetry} onChangeServer={onChangeServer} />);
		expect(screen.getByText(`Cannot reach ${serverHost}`)).toBeOnTheScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await fireEvent.press(screen.getByRole("button", { name: "Change server" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(onChangeServer).toHaveBeenCalledTimes(1);
	});

	// MI-48. The first attempts never reach a socket, so the server counts
	// the Retry as its first inbox.get.
	test("Retry asks the server again", async () => {
		restoreFetch = disconnect();
		await renderNeedsYou();
		expect(await screen.findByText(`Cannot reach ${serverHost}`)).toBeOnTheScreen();
		const server = createFakeServer();
		restoreFetch();
		restoreFetch = connect(server);
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(callsTo(server, "inbox.get")).toHaveLength(1));
		expect(await screen.findByTestId("inbox-row-CDE-42")).toBeOnTheScreen();
		expect(sectionHeader("Review")).toBeOnTheScreen();
		expect(screen.queryByText(`Cannot reach ${serverHost}`)).toBeNull();
	});
});
