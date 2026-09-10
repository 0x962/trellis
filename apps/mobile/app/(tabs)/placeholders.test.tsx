import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { renderRouter, screen } from "expo-router/testing-library";
import { createMMKV } from "react-native-mmkv";
import { appContext } from "../../test/appContext";

const store = createMMKV();
const realFetch = globalThis.fetch;

// Each placeholder tab: its URL, its header title, and its empty state.
const screens: Array<[string, string, string]> = [
	["/", "Needs you", "Nothing needs you"],
	["/search", "Search", "No recent searches"],
	["/projects", "Projects", "No projects yet"],
];

describe("the placeholder tabs", () => {
	beforeEach(() => {
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "navid");
		globalThis.fetch = jest.fn(() => Promise.reject(new Error("no network in this test"))) as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("the placeholder tabs render the chrome and an empty state", async () => {
		for (const [url, title, empty] of screens) {
			const view = renderRouter(appContext(), { initialUrl: url });
			const rendered = await view;
			expect(view.getPathname()).toBe(url);
			expect(screen.getByRole("header", { name: title })).toBeOnTheScreen();
			expect(screen.getByText(empty)).toBeOnTheScreen();
			await rendered.unmount();
		}
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
});
