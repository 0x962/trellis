import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import { recentSearchesKey } from "../../src/features/search/recentSearches";
import { store } from "../../src/lib/store";
import { debounceMs } from "../../src/lib/useDebouncedValue";
import { layout } from "../../src/theme/layout";
import { appContext } from "../../test/appContext";
import { type BrowseData, oauthTitles, rootName, seedBrowse } from "../../test/browse";
import { connect } from "../../test/connect";
import type { Recorder } from "../../test/record";
import { renderRoute } from "../../test/renderRoute";
import { human } from "../../test/server";

let data: BrowseData;
let net: Recorder;

beforeEach(async () => {
	data = await seedBrowse();
	net = connect();
});

afterEach(() => {
	jest.useRealTimers();
	net.restore();
});

const openSearch = () => renderRoute("/search");

// The clock stays fake for a test that drives the debounce. Such a test reads
// the requests the field sends and never an answer.
const openSearchOnFakeClock = async () => {
	const view = renderRouter(appContext(), { initialUrl: "/search" });
	await view;
	return { getPathname: () => view.getPathname() };
};

const field = () => screen.getByTestId("search-field");

const searches = () => net.callsTo("search.query");

const shown = () =>
	screen.queryAllByTestId(/^ticket-row-/).map((row) => (row.props.testID as string).replace("ticket-row-", ""));

const search = async (text: string) => {
	await fireEvent.changeText(field(), text);
	await waitFor(() => expect(searches().length).toBeGreaterThan(0));
};

describe("the Search tab", () => {
	test("the empty search field shows the stored recent searches", async () => {
		store.set(recentSearchesKey, JSON.stringify(["oauth", "terminal"]));
		await openSearch();

		expect(screen.getByText("oauth")).toBeOnTheScreen();
		expect(screen.getByText("terminal")).toBeOnTheScreen();
		expect(searches()).toEqual([]);
	});

	test("a tap on a recent search runs it again", async () => {
		store.set(recentSearchesKey, JSON.stringify(["oauth"]));
		await openSearch();

		await fireEvent.press(screen.getByText("oauth"));
		await waitFor(() => expect(searches()).toHaveLength(1));
		expect(field().props.value).toBe("oauth");
		expect((searches()[0]!.input as { q: string }).q).toBe("oauth");
	});

	test("a completed search becomes the newest recent search", async () => {
		await openSearch();
		await search("oauth");

		await waitFor(() => expect(store.getString(recentSearchesKey)).toBeDefined());
		expect(JSON.parse(store.getString(recentSearchesKey)!)[0]).toBe("oauth");
	});

	// The field searches as the person types, so one query passes through
	// several shorter queries on its way. They fill one slot, not eight.
	test("the fragments of one typed query leave one recent search", async () => {
		await openSearch();
		await search("log");
		await fireEvent.changeText(field(), "login");
		await waitFor(() => expect(searches()).toHaveLength(2));
		await fireEvent.changeText(field(), "login bug");
		await waitFor(() => expect(searches()).toHaveLength(3));

		await waitFor(() => expect(JSON.parse(store.getString(recentSearchesKey)!)[0]).toBe("login bug"));
		expect(JSON.parse(store.getString(recentSearchesKey)!)).toEqual(["login bug"]);
	});

	test("search results render as fixed-height ticket rows", async () => {
		await openSearch();
		await search("oauth");

		const hits = await human.search.query({ q: "oauth", limit: 20 });
		await waitFor(() => expect(shown()).toEqual(hits.tickets.map((ticket) => ticket.identifier)));
		expect(shown()).toHaveLength(3);
		expect(screen.getByText(oauthTitles[0]!)).toBeOnTheScreen();
		expect(within(screen.getByTestId(`ticket-row-${data.oauth[0]}`)).getByLabelText(/Todo/)).toBeTruthy();
		for (const identifier of shown()) {
			const style = StyleSheet.flatten(screen.getByTestId(`ticket-row-${identifier}`).props.style) as {
				height?: number;
			};
			expect(style.height).toBe(layout.ticketRow);
		}
	});

	test("a tap on a result opens the ticket route", async () => {
		const view = await openSearch();
		await search("oauth");

		await waitFor(() => expect(screen.getByTestId(`ticket-row-${data.oauth[0]}`)).toBeOnTheScreen());
		await fireEvent.press(screen.getByTestId(`ticket-row-${data.oauth[0]}`));
		await waitFor(() => expect(view.getPathname()).toBe(`/ticket/${data.oauth[0]}`));
	});

	test("a submitted KEY-n query jumps straight to the ticket", async () => {
		jest.useFakeTimers();
		const view = await openSearchOnFakeClock();

		await fireEvent.changeText(field(), data.review.toLowerCase());
		await fireEvent(field(), "submitEditing");
		await act(async () => {
			jest.advanceTimersByTime(debounceMs * 3);
		});

		await waitFor(() => expect(view.getPathname()).toBe(`/ticket/${data.review}`));
		expect(searches()).toEqual([]);
	});

	test("typing an identifier never navigates before the submit", async () => {
		const view = await openSearch();

		await fireEvent.changeText(field(), data.review.slice(0, -1));
		await waitFor(() => expect(searches()).toHaveLength(1));
		await fireEvent.changeText(field(), data.review);
		await waitFor(() => expect(searches()).toHaveLength(2));

		expect(view.getPathname()).toBe("/search");
		await waitFor(() => expect(screen.getByTestId(`ticket-row-${data.review}`)).toBeOnTheScreen());
	});

	test("the results list holds ticket rows only", async () => {
		// The server answers "code" with one ticket and the project named Code.
		await openSearch();
		await search("code");

		await waitFor(() => expect(shown()).toEqual([data.named]));
		expect(screen.queryByText(rootName)).toBeNull();
		expect(screen.queryByTestId(`project-row-${data.root}`)).toBeNull();
	});

	test("a search with no hit shows an empty state", async () => {
		await openSearch();
		await search("zzzznothing");

		await waitFor(() => expect(screen.getByText(/zzzznothing/)).toBeOnTheScreen());
		expect(shown()).toEqual([]);
	});
});
