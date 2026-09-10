import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { queryClient } from "../../src/lib/queryClient";
import { appContext } from "../../test/appContext";
import { connect, disconnect } from "../../test/connect";
import { createFakeServer } from "../../test/fakeServer";
import { emptyInboxServer, quietInboxServer, totals } from "../../test/inboxServers";
import { swipeRight } from "../../test/swipe";

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;
const tab = () => screen.getByRole(tabRole, { name: "Needs you" });
const badge = () => within(tab()).queryByText(/^\d+$/);

let restoreFetch = () => {};

describe("the Needs you tab", () => {
	beforeEach(() => {
		queryClient.clear();
		queryClient.setDefaultOptions({
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: 86_400_000 },
		});
	});

	afterEach(() => {
		restoreFetch();
	});

	// MI-09
	test("a tap on a row pushes the ticket screen for that identifier", async () => {
		restoreFetch = connect(createFakeServer());
		const view = renderRouter(appContext(), { initialUrl: "/" });
		await view;
		await fireEvent.press(await screen.findByTestId("inbox-row-CDE-42"));
		await waitFor(() => expect(view.getPathname()).toBe("/ticket/CDE-42"));
		expect(screen.getByRole("header", { name: "CDE-42" })).toBeOnTheScreen();
	});

	// MI-18
	test("the Needs you tab shows the badge for review plus failing CI", async () => {
		restoreFetch = connect(createFakeServer());
		await renderRouter(appContext(), { initialUrl: "/" });
		await screen.findByTestId("inbox-row-CDE-42");
		await waitFor(() => expect(within(tab()).getByText("4")).toBeOnTheScreen());
	});

	// MI-19
	test("stalled and done rows never raise the tab badge", async () => {
		const server = quietInboxServer();
		expect(totals(await server.client.inbox.get({}))).toEqual([0, 0, 2, 6]);
		restoreFetch = connect(server);
		await renderRouter(appContext(), { initialUrl: "/" });
		await screen.findByTestId("inbox-row-CDE-38");
		expect(within(screen.getByRole("button", { name: "Stalled" })).getByText("2")).toBeOnTheScreen();
		expect(badge()).toBeNull();
	});

	// MI-20
	test("an approve lowers the tab badge and the review count", async () => {
		restoreFetch = connect(createFakeServer());
		await renderRouter(appContext(), { initialUrl: "/" });
		await screen.findByTestId("inbox-row-CDE-42");
		await waitFor(() => expect(within(tab()).getByText("4")).toBeOnTheScreen());
		await act(() => swipeRight("CDE-42"));
		await waitFor(() => expect(within(tab()).getByText("3")).toBeOnTheScreen());
		expect(within(screen.getByRole("button", { name: "Review" })).getByText("2")).toBeOnTheScreen();
		expect(screen.queryByTestId("inbox-row-CDE-42")).toBeNull();
	});

	// MI-43
	test("an empty inbox leaves the tab without a badge", async () => {
		restoreFetch = connect(await emptyInboxServer(2));
		await renderRouter(appContext(), { initialUrl: "/" });
		expect(await screen.findByText("Nothing needs you. 2 tickets in progress by agents.")).toBeOnTheScreen();
		expect(badge()).toBeNull();
	});

	// MI-49
	test("Change server opens the setup screen", async () => {
		restoreFetch = disconnect();
		const view = renderRouter(appContext(), { initialUrl: "/" });
		await view;
		expect(await screen.findByText("Cannot reach 192.168.1.20:4521")).toBeOnTheScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Change server" }));
		await waitFor(() => expect(view.getPathname()).toBe("/setup"));
		expect(screen.getByDisplayValue("http://192.168.1.20:4521")).toBeOnTheScreen();
	});
});
