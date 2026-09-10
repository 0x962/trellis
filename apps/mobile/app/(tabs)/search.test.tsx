import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import { recentSearchesKey } from "../../src/features/search/recentSearches";
import { store } from "../../src/lib/store";
import { debounceMs } from "../../src/lib/useDebouncedValue";
import { layout } from "../../src/theme/layout";
import { appContext } from "../../test/appContext";
import { callsTo, type FakeServer, startFakeServer, stopFakeServer } from "../../test/fakeServer";

let server: FakeServer;

beforeEach(() => {
	server = startFakeServer();
});

afterEach(() => {
	jest.useRealTimers();
	stopFakeServer(server);
});

// `renderRouter` returns a thenable. Await it once, and the route tree is
// mounted; the object itself carries `getPathname`.
const openSearch = () => renderRouter(appContext(), { initialUrl: "/search" });

const field = () => screen.getByTestId("search-field");

const searches = () => callsTo(server, "search.query");

const shown = () =>
	screen.queryAllByTestId(/^ticket-row-/).map((row) => (row.props.testID as string).replace("ticket-row-", ""));

const search = async (text: string) => {
	fireEvent.changeText(field(), text);
	await waitFor(() => expect(searches().length).toBeGreaterThan(0));
};

describe("the Search tab", () => {
	test("the empty search field shows the stored recent searches", async () => {
		store.set(recentSearchesKey, JSON.stringify(["oauth", "terminal"]));
		const view = openSearch();
		await view;

		expect(screen.getByText("oauth")).toBeOnTheScreen();
		expect(screen.getByText("terminal")).toBeOnTheScreen();
		expect(searches()).toEqual([]);
	});

	test("a tap on a recent search runs it again", async () => {
		store.set(recentSearchesKey, JSON.stringify(["oauth"]));
		const view = openSearch();
		await view;

		fireEvent.press(screen.getByText("oauth"));
		await waitFor(() => expect(searches()).toHaveLength(1));
		expect(field().props.value).toBe("oauth");
		expect((searches()[0]!.input as { q: string }).q).toBe("oauth");
	});

	test("a completed search becomes the newest recent search", async () => {
		const view = openSearch();
		await view;
		await search("oauth");

		await waitFor(() => expect(store.getString(recentSearchesKey)).toBeDefined());
		expect(JSON.parse(store.getString(recentSearchesKey)!)[0]).toBe("oauth");
	});

	test("search results render as fixed-height ticket rows", async () => {
		const view = openSearch();
		await view;
		await search("oauth");

		await waitFor(() => expect(shown()).toEqual(["CDE-51", "TRL-12", "MRG-3"]));
		expect(screen.getByText("Refresh the OAuth token before the gh poller runs")).toBeOnTheScreen();
		expect(screen.getByLabelText(/Todo/)).toBeTruthy();
		for (const identifier of shown()) {
			const style = StyleSheet.flatten(screen.getByTestId(`ticket-row-${identifier}`).props.style) as {
				height?: number;
			};
			expect(style.height).toBe(layout.ticketRow);
		}
	});

	test("a tap on a result opens the ticket route", async () => {
		const view = openSearch();
		await view;
		await search("oauth");

		await waitFor(() => expect(screen.getByTestId("ticket-row-CDE-51")).toBeOnTheScreen());
		fireEvent.press(screen.getByTestId("ticket-row-CDE-51"));
		await waitFor(() => expect(view.getPathname()).toBe("/ticket/CDE-51"));
	});

	test("a submitted KEY-n query jumps straight to the ticket", async () => {
		jest.useFakeTimers();
		const view = openSearch();
		await view;

		fireEvent.changeText(field(), "cde-42");
		fireEvent(field(), "submitEditing");
		await act(async () => {
			jest.advanceTimersByTime(debounceMs * 3);
		});

		await waitFor(() => expect(view.getPathname()).toBe("/ticket/CDE-42"));
		expect(searches()).toEqual([]);
	});

	test("typing an identifier never navigates before the submit", async () => {
		const view = openSearch();
		await view;

		fireEvent.changeText(field(), "CDE-4");
		await waitFor(() => expect(searches()).toHaveLength(1));
		fireEvent.changeText(field(), "CDE-42");
		await waitFor(() => expect(searches()).toHaveLength(2));

		expect(view.getPathname()).toBe("/search");
		await waitFor(() => expect(screen.getByTestId("ticket-row-CDE-42")).toBeOnTheScreen());
	});

	test("the results list holds ticket rows only", async () => {
		// The fake server answers "cde" with one ticket and three projects.
		const view = openSearch();
		await view;
		await search("cde");

		await waitFor(() => expect(shown()).toEqual(["CDE-42"]));
		expect(screen.queryByText("Superset CDE")).toBeNull();
		expect(screen.queryByTestId("project-row-CDE")).toBeNull();
	});

	test("a search with no hit shows an empty state", async () => {
		const view = openSearch();
		await view;
		await search("zzzznothing");

		await waitFor(() => expect(screen.getByText(/zzzznothing/)).toBeOnTheScreen());
		expect(shown()).toEqual([]);
	});
});
