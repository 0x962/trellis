import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { SearchQueryInput } from "@trellis/api";
import { renderRouter } from "expo-router/testing-library";
import { debounceMs } from "../../src/lib/useDebouncedValue";
import { appContext } from "../../test/appContext";
import { type FakeServer, inputsTo, startFakeServer, stopFakeServer } from "../../test/fakeServer";

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

const queries = () => inputsTo(server, "search.query") as SearchQueryInput[];

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
		const view = openSearch();
		await view;

		await typeInWindow("oauth");
		await settle();

		await waitFor(() => expect(queries()).toHaveLength(1));
		expect(queries()[0]!.q).toBe("oauth");
	});

	test("a pause between two bursts sends two search requests", async () => {
		jest.useFakeTimers();
		const view = openSearch();
		await view;

		await typeInWindow("oauth");
		await settle();
		await waitFor(() => expect(queries()).toHaveLength(1));

		await fireEvent.changeText(field(), "oauth token");
		await settle();

		await waitFor(() => expect(queries()).toHaveLength(2));
		expect(queries().map((input) => input.q)).toEqual(["oauth", "oauth token"]);
	});

	test("a superseded search never overwrites the newer results", async () => {
		// The first response waits for `release`, so it lands after the second.
		const inner = globalThis.fetch;
		let held: (() => void) | undefined;
		const first = new Promise<void>((resolve) => {
			held = resolve;
		});
		let calls = 0;
		globalThis.fetch = (async (request: Request, init: RequestInit) => {
			calls += 1;
			const response = await inner(request, init);
			if (calls === 1) await first;
			return response;
		}) as unknown as typeof fetch;

		const view = openSearch();
		await view;
		await fireEvent.changeText(field(), "oauth");
		// The debounce sends the first query before the second one starts.
		await waitFor(() => expect(queries()).toHaveLength(1));
		await fireEvent.changeText(field(), "terminal");

		await waitFor(() => expect(screen.getByTestId("ticket-row-CDE-44")).toBeOnTheScreen());
		held!();
		await act(async () => {});

		expect(screen.getByTestId("ticket-row-CDE-44")).toBeOnTheScreen();
		expect(screen.queryByTestId("ticket-row-CDE-51")).toBeNull();
	});

	test("clearing the field sends no request", async () => {
		jest.useFakeTimers();
		const view = openSearch();
		await view;

		await typeInWindow("oauth");
		await settle();
		await waitFor(() => expect(queries()).toHaveLength(1));

		await fireEvent.changeText(field(), "");
		await settle();
		await settle();
		expect(queries()).toHaveLength(1);
	});

	test("a search request carries no project scope", async () => {
		const view = openSearch();
		await view;
		await fireEvent.changeText(field(), "oauth");

		await waitFor(() => expect(queries()).toHaveLength(1));
		expect(Object.keys(queries()[0]!).sort()).toEqual(["limit", "q"]);
	});
});
