import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { connect, disconnect } from "../../../test/connect";
import { bumpVersion, type InboxData, seedInbox } from "../../../test/inbox";
import { paintedColors } from "../../../test/paint";
import type { Recorder } from "../../../test/record";
import { renderNeedsYou, rowIdentifiers, testQueryClient } from "../../../test/renderNeedsYou";
import { serverHost } from "../../../test/server";
import { swipeLeft, swipeRight } from "../../../test/swipe";
import { persistClient, restoreClient } from "../../lib/storage";
import { store } from "../../lib/store";
import { tokens } from "../../theme/tokens";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

const banner = "Offline, showing cached data";
const unreachable = `Cannot reach ${serverHost}`;
const headerPattern = /^(Review|Failing CI|Stalled|Done by agents today)$/;

let data: InboxData;
let net: Recorder | undefined;
let restoreFetch = () => {};

const first = () => data.review[0]!;

// Fills the store with the snapshot the app writes after one good inbox.get,
// then takes the server away.
const restoredCache = async () => {
	net = connect();
	const view = await renderNeedsYou();
	await screen.findByTestId(`inbox-row-${first()}`);
	await persistClient(view.queryClient, store);
	await view.unmount();
	net.restore();
	net = undefined;
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
	beforeEach(async () => {
		data = await seedInbox({ stalled: false });
	});

	afterEach(() => {
		restoreFetch();
		restoreFetch = () => {};
		net?.restore();
		net = undefined;
	});

	// MI-40
	test("pull to refresh refetches inbox.get once", async () => {
		net = connect();
		await renderNeedsYou();
		await screen.findByTestId(`inbox-row-${first()}`);
		const fetches = net.callsTo("inbox.get").length;
		const hold = net.hold("inbox.get");
		const list = () => screen.getByTestId("inbox-list");
		const refreshing = () => (list().props.refreshControl as { props: { refreshing: boolean } }).props.refreshing;
		expect(refreshing()).toBe(false);
		await act(() => fireEvent(list(), "refresh"));
		await waitFor(() => expect(hold.state.held).toBe(1));
		expect(refreshing()).toBe(true);
		hold.release();
		await waitFor(() => expect(refreshing()).toBe(false));
		expect(net.callsTo("inbox.get")).toHaveLength(fetches + 1);
	});

	// MI-41
	test("the empty state states the exact sentence with the in-progress count", async () => {
		await seedInbox({ review: 0, failingCi: false, stalled: false, done: 0, inProgress: 3 });
		net = connect();
		await renderNeedsYou();
		expect(await screen.findByText("Nothing needs you. 3 tickets in progress by agents.")).toBeOnTheScreen();
		expect(screen.queryAllByRole("button", { name: headerPattern })).toHaveLength(0);
		expect(rowIdentifiers()).toEqual([]);
	});

	// MI-42
	test("the empty state uses the singular for one ticket in progress", async () => {
		await seedInbox({ review: 0, failingCi: false, stalled: false, done: 0, inProgress: 1 });
		net = connect();
		await renderNeedsYou();
		expect(await screen.findByText("Nothing needs you. 1 ticket in progress by agents.")).toBeOnTheScreen();
	});

	// MI-44
	test("restored cache renders under the offline banner", async () => {
		await renderNeedsYou(await restoredCache());
		expect(await screen.findByText(banner)).toBeOnTheScreen();
		expect(await screen.findByTestId(`inbox-row-${first()}`)).toBeOnTheScreen();
		expect(rowIdentifiers()).toEqual([...data.review, data.failingCi]);
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
		net = connect();
		await renderNeedsYou();
		await screen.findByTestId(`inbox-row-${first()}`);
		await fireEvent.press(screen.getByRole("button", { name: "Done by agents today" }));
		await screen.findByTestId(`inbox-row-${data.done[0]}`);
		onlyPalette();

		await act(() => swipeLeft(data.review[1]!));
		await screen.findByPlaceholderText("What should change?");
		onlyPalette();
		await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

		await bumpVersion(first());
		await act(() => swipeRight(first()));
		await screen.findByTestId("toast");
		onlyPalette();
	});
});
