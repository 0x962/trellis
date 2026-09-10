import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createMMKV } from "react-native-mmkv";
import { connect, disconnect, hang } from "../../../../../test/connect";
import { createFakeServer } from "../../../../../test/fakeServer";
import { paintedColors } from "../../../../../test/paint";
import { renderNeedsYou, testQueryClient } from "../../../../../test/renderNeedsYou";
import { persistClient, restoreClient } from "../../../../lib/storage";
import { tokens } from "../../../../theme/tokens";
import { OfflineBanner } from "./OfflineBanner";

jest.mock("@shopify/flash-list", () => require("../../../../../test/mocks/flash-list"));

const banner = "Offline, showing cached data";
const store = createMMKV();
let restoreFetch = () => {};

// Fills MMKV with the snapshot the app writes after one good inbox.get.
const snapshotInbox = async () => {
	const server = createFakeServer();
	restoreFetch = connect(server);
	const view = await renderNeedsYou();
	await screen.findByTestId("inbox-row-CDE-42");
	await persistClient(view.queryClient, store);
	await view.unmount();
	restoreFetch();
	return server;
};

const renderBanner = (queryClient: ReturnType<typeof testQueryClient>) =>
	render(
		<QueryClientProvider client={queryClient}>
			<OfflineBanner />
		</QueryClientProvider>,
	);

describe("OfflineBanner", () => {
	afterEach(() => {
		restoreFetch();
	});

	// MI-45
	test("the offline banner leaves after the first successful request", async () => {
		const server = await snapshotInbox();
		restoreFetch = disconnect();
		const queryClient = testQueryClient();
		await restoreClient(queryClient, store);
		await renderBanner(queryClient);
		expect(await screen.findByText(banner)).toBeOnTheScreen();
		const colors = paintedColors(screen.toJSON());
		expect([...colors].some((color) => color === tokens.dark.warning || color === tokens.dark.warningSoft)).toBe(true);
		const palette = new Set(Object.values(tokens.dark));
		expect([...colors].filter((color) => !palette.has(color))).toEqual([]);

		restoreFetch();
		restoreFetch = connect(server);
		await act(async () => {
			await queryClient.refetchQueries();
		});
		await waitFor(() => expect(screen.queryByText(banner)).toBeNull());
	});

	// MI-46. The banner speaks of cached data, so an empty cache shows none.
	test("no cached data means no offline banner", async () => {
		restoreFetch = hang();
		const queryClient = testQueryClient();
		await restoreClient(queryClient, store);
		const alone = await renderBanner(queryClient);
		await act(async () => {
			await Promise.resolve();
		});
		expect(screen.queryByText(banner)).toBeNull();
		await alone.unmount();

		await renderNeedsYou(testQueryClient());
		await act(async () => {
			await Promise.resolve();
		});
		expect(screen.queryByText(banner)).toBeNull();
	});
});
