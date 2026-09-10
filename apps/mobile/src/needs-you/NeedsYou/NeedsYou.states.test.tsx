import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { createMMKV } from "react-native-mmkv";
import { connect, disconnect, holdCalls } from "../../../test/connect";
import { callsTo, createFakeServer, serverHost } from "../../../test/fakeServer";
import { bumpVersion, emptyInboxServer } from "../../../test/inboxServers";
import { paintedColors } from "../../../test/paint";
import { renderNeedsYou, rowIdentifiers, testQueryClient } from "../../../test/renderNeedsYou";
import { swipeLeft, swipeRight } from "../../../test/swipe";
import { persistClient, restoreClient } from "../../lib/storage";
import { tokens } from "../../theme/tokens";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

const banner = "Offline, showing cached data";
const unreachable = `Cannot reach ${serverHost}`;
const headerPattern = /^(Review|Failing CI|Stalled|Done by agents today)$/;
const store = createMMKV();
let restoreFetch = () => {};

// Fills MMKV with the snapshot the app writes after one good inbox.get,
// then takes the server away.
const restoredCache = async () => {
	restoreFetch = connect(createFakeServer());
	const view = await renderNeedsYou();
	await screen.findByTestId("inbox-row-CDE-42");
	await persistClient(view.queryClient, store);
	await view.unmount();
	restoreFetch();
	restoreFetch = disconnect();
	const queryClient = testQueryClient();
	await restoreClient(queryClient, store);
	return queryClient;
};

const onlyPalette = () => {
	const palette = new Set([...Object.values(tokens.dark), tokens.onAccent]);
	const colors = paintedColors(screen.toJSON());
	expect(colors.size).toBeGreaterThan(0);
	expect([...colors].filter((color) => !palette.has(color))).toEqual([]);
};

describe("NeedsYou states", () => {
	afterEach(() => {
		restoreFetch();
	});

	// MI-40
	test("pull to refresh refetches inbox.get once", async () => {
		const server = createFakeServer();
		restoreFetch = connect(server);
		await renderNeedsYou();
		await screen.findByTestId("inbox-row-CDE-42");
		const fetches = callsTo(server, "inbox.get").length;
		const hold = holdCalls("inbox.get");
		const list = () => screen.getByTestId("inbox-list");
		const refreshing = () => (list().props.refreshControl as { props: { refreshing: boolean } }).props.refreshing;
		expect(refreshing()).toBe(false);
		await act(() => fireEvent(list(), "refresh"));
		await waitFor(() => expect(hold.state.held).toBe(1));
		expect(refreshing()).toBe(true);
		hold.release();
		await waitFor(() => expect(refreshing()).toBe(false));
		expect(callsTo(server, "inbox.get")).toHaveLength(fetches + 1);
	});

	// MI-41
	test("the empty state states the exact sentence with the in-progress count", async () => {
		restoreFetch = connect(await emptyInboxServer(3));
		await renderNeedsYou();
		expect(await screen.findByText("Nothing needs you. 3 tickets in progress by agents.")).toBeOnTheScreen();
		expect(screen.queryAllByRole("button", { name: headerPattern })).toHaveLength(0);
		expect(rowIdentifiers()).toEqual([]);
	});

	// MI-42
	test("the empty state uses the singular for one ticket in progress", async () => {
		restoreFetch = connect(await emptyInboxServer(1));
		await renderNeedsYou();
		expect(await screen.findByText("Nothing needs you. 1 ticket in progress by agents.")).toBeOnTheScreen();
	});

	// MI-44
	test("restored cache renders under the offline banner", async () => {
		await renderNeedsYou(await restoredCache());
		expect(await screen.findByText(banner)).toBeOnTheScreen();
		expect(await screen.findByTestId("inbox-row-CDE-42")).toBeOnTheScreen();
		expect(rowIdentifiers()).toEqual(["CDE-42", "CDE-37", "TRL-9", "CDE-44", "CDE-38"]);
	});

	// MI-47
	test("an unreachable server fills the tab with the retry and change server actions", async () => {
		restoreFetch = disconnect();
		await renderNeedsYou();
		expect(await screen.findByText(unreachable)).toBeOnTheScreen();
		expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
		expect(screen.getByRole("button", { name: "Change server" })).toBeOnTheScreen();
		expect(screen.queryAllByRole("button", { name: headerPattern })).toHaveLength(0);
	});

	// MI-50
	test("cached data wins over the unreachable screen", async () => {
		await renderNeedsYou(await restoredCache());
		expect(await screen.findByText(banner)).toBeOnTheScreen();
		await act(async () => {
			await Promise.resolve();
		});
		expect(screen.queryByText(unreachable)).toBeNull();
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
		expect(screen.getByRole("button", { name: "Review" })).toBeOnTheScreen();
	});

	// MI-59. The screen, the sheet, and the toast paint the dark palette only.
	test("the screen paints only palette colors", async () => {
		const server = createFakeServer();
		restoreFetch = connect(server);
		await renderNeedsYou();
		await screen.findByTestId("inbox-row-CDE-42");
		await fireEvent.press(screen.getByRole("button", { name: "Done by agents today" }));
		await screen.findByTestId("inbox-row-CDE-48");
		onlyPalette();

		await act(() => swipeLeft("CDE-37"));
		await screen.findByPlaceholderText("What should change?");
		onlyPalette();
		await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

		bumpVersion(server, "CDE-42");
		await act(() => swipeRight("CDE-42"));
		await screen.findByTestId("toast");
		onlyPalette();
	});
});
