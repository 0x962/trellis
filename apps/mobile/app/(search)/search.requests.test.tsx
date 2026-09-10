import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { SearchQueryInput } from "@trellis/api";
import { renderRouter } from "expo-router/testing-library";
import { debounceMs } from "../../src/lib/useDebouncedValue";
import { appContext } from "../../test/appContext";
import { type BrowseData, seedBrowse } from "../../test/browse";
import { connect } from "../../test/connect";
import type { Recorder } from "../../test/record";
import { renderRoute } from "../../test/renderRoute";

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

// The clock stays fake for a test that drives the debounce. Such a test reads
// the requests the field sends and never an answer.
const openSearchOnFakeClock = () => renderRouter(appContext(), { initialUrl: "/search" });

const openSearch = () => renderRoute("/search");

const field = () => screen.getByTestId("search-field");

const queries = () => net.inputsTo("search.query") as SearchQueryInput[];

// Types one character at a time, so every keystroke lands inside one window.
const typeInWindow = async (text: string) => {
	for (let length = 1; length <= text.length; length += 1) {
		await fireEvent.changeText(field(), text.slice(0, length));
		await act(() => jest.advanceTimersByTime(20));
	}
};

const settle = async () => {
	await act(async () => {
		jest.advanceTimersByTime(debounceMs);
	});
};

describe("the Search tab requests", () => {
	test("typing inside the window sends one search request", async () => {
		jest.useFakeTimers();
		await openSearchOnFakeClock();

		await typeInWindow("oauth");
		await settle();

		await waitFor(() => expect(queries()).toHaveLength(1));
		expect(queries()[0]!.q).toBe("oauth");
	});

	test("a pause between two bursts sends two search requests", async () => {
		jest.useFakeTimers();
		await openSearchOnFakeClock();

		await typeInWindow("oauth");
		await settle();
		await waitFor(() => expect(queries()).toHaveLength(1));

		await fireEvent.changeText(field(), "oauth token");
		await settle();

		await waitFor(() => expect(queries()).toHaveLength(2));
		expect(queries().map((input) => input.q)).toEqual(["oauth", "oauth token"]);
	});

	test("a superseded search never overwrites the newer results", async () => {
		// The first search answer waits for `release`, so it lands after the
		// second one.
		const inner = globalThis.fetch;
		let release = () => {};
		const first = new Promise<void>((resolve) => {
			release = resolve;
		});
		let searches = 0;
		globalThis.fetch = (async (request: Request, init: RequestInit) => {
			const held = new URL(request.url).pathname.endsWith("/rpc/search/query") && (searches += 1) === 1;
			const response = await inner(request, init);
			if (held) await first;
			return response;
		}) as unknown as typeof fetch;

		await openSearch();
		await fireEvent.changeText(field(), "oauth");
		// The debounce sends the first query before the second one starts.
		await waitFor(() => expect(queries()).toHaveLength(1));
		await fireEvent.changeText(field(), "terminal");

		await waitFor(() => expect(screen.getByTestId(`ticket-row-${data.terminal}`)).toBeOnTheScreen());
		release();
		await act(async () => {});

		expect(screen.getByTestId(`ticket-row-${data.terminal}`)).toBeOnTheScreen();
		expect(screen.queryByTestId(`ticket-row-${data.oauth[0]}`)).toBeNull();
	});

	test("clearing the field sends no request", async () => {
		jest.useFakeTimers();
		await openSearchOnFakeClock();

		await typeInWindow("oauth");
		await settle();
		await waitFor(() => expect(queries()).toHaveLength(1));

		await fireEvent.changeText(field(), "");
		await settle();
		await settle();
		expect(queries()).toHaveLength(1);
	});

	test("a search request carries no project scope", async () => {
		await openSearch();
		await fireEvent.changeText(field(), "oauth");

		await waitFor(() => expect(queries()).toHaveLength(1));
		expect(Object.keys(queries()[0]!).sort()).toEqual(["limit", "q"]);
	});
});
