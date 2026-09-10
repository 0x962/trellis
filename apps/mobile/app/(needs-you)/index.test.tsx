import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { queryClient } from "../../src/lib/queryClient";
import { connect, disconnect } from "../../test/connect";
import { type InboxData, seedInbox, totals } from "../../test/inbox";
import type { Recorder } from "../../test/record";
import { renderRoute } from "../../test/renderRoute";
import { human, serverHost, serverUrl } from "../../test/server";
import { swipeRight } from "../../test/swipe";

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;
const tab = () => screen.getByRole(tabRole, { name: "Needs you" });
const badge = () => within(tab()).queryByText(/^\d+$/);

let data: InboxData;
let net: Recorder | undefined;
let restoreFetch = () => {};

const first = () => data.review[0]!;

describe("the Needs you tab", () => {
	beforeEach(() => {
		queryClient.clear();
		queryClient.setDefaultOptions({
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: 86_400_000 },
		});
	});

	afterEach(() => {
		restoreFetch();
		restoreFetch = () => {};
		net?.restore();
		net = undefined;
	});

	// MI-09
	test("a tap on a row pushes the ticket screen for that identifier", async () => {
		data = await seedInbox({ stalled: false });
		net = connect();
		const view = await renderRoute("/");
		await fireEvent.press(await screen.findByTestId(`inbox-row-${first()}`));
		await waitFor(() => expect(view.getPathname()).toBe(`/ticket/${first()}`));
		expect(screen.getByRole("header", { name: first() })).toBeOnTheScreen();
	});

	// MI-18
	test("the Needs you tab shows the badge for review plus failing CI", async () => {
		data = await seedInbox({ stalled: false });
		net = connect();
		await renderRoute("/");
		await screen.findByTestId(`inbox-row-${first()}`);
		await waitFor(() => expect(within(tab()).getByText("4")).toBeOnTheScreen());
	});

	// MI-19
	test("stalled and done rows never raise the tab badge", async () => {
		data = await seedInbox({ review: 0, failingCi: false });
		expect(totals(await human.inbox.get({}))).toEqual([0, 0, 1, 3]);
		net = connect();
		await renderRoute("/");
		await screen.findByTestId(`inbox-row-${data.stalled}`);
		expect(within(screen.getByRole("button", { name: "Stalled" })).getByText("1")).toBeOnTheScreen();
		expect(badge()).toBeNull();
	});

	// MI-20
	test("an approve lowers the tab badge and the review count", async () => {
		data = await seedInbox({ stalled: false });
		net = connect();
		await renderRoute("/");
		await screen.findByTestId(`inbox-row-${first()}`);
		await waitFor(() => expect(within(tab()).getByText("4")).toBeOnTheScreen());
		await act(() => swipeRight(first()));
		await waitFor(() => expect(within(tab()).getByText("3")).toBeOnTheScreen());
		expect(within(screen.getByRole("button", { name: "Review" })).getByText("2")).toBeOnTheScreen();
		expect(screen.queryByTestId(`inbox-row-${first()}`)).toBeNull();
	});

	// MI-43
	test("an empty inbox leaves the tab without a badge", async () => {
		await seedInbox({ review: 0, failingCi: false, stalled: false, done: 0, inProgress: 2 });
		net = connect();
		await renderRoute("/");
		expect(await screen.findByText("Nothing needs you. 2 tickets in progress by agents.")).toBeOnTheScreen();
		expect(badge()).toBeNull();
	});

	// MI-49
	test("Change server opens the setup screen", async () => {
		restoreFetch = disconnect();
		const view = await renderRoute("/");
		expect(await screen.findByText(`Cannot reach ${serverHost}`, {}, { timeout: 5_000 })).toBeOnTheScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Change server" }));
		await waitFor(() => expect(view.getPathname()).toBe("/setup"));
		expect(screen.getByDisplayValue(serverUrl)).toBeOnTheScreen();
	});
});
