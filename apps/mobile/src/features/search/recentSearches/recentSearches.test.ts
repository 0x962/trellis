import { expect, test } from "bun:test";
import { clearRecents, maxRecentSearches, pushRecent, type RecentStore, readRecents } from "./recentSearches";

const fakeStore = (): RecentStore => {
	const values = new Map<string, string>();
	return {
		getString: (key) => values.get(key),
		set: (key, value) => {
			values.set(key, value);
		},
	};
};

test("clearRecents leaves the list empty and readable", () => {
	const store = fakeStore();
	pushRecent(store, "crisp");
	pushRecent(store, "fjord");

	clearRecents(store);

	expect(readRecents(store)).toEqual([]);
});

test("a query stored after a clear starts the list again", () => {
	const store = fakeStore();
	pushRecent(store, "crisp");
	clearRecents(store);

	pushRecent(store, "fjord");

	expect(readRecents(store)).toEqual(["fjord"]);
});

test("the list keeps the newest queries and drops the oldest", () => {
	const store = fakeStore();
	for (let index = 0; index <= maxRecentSearches; index += 1) pushRecent(store, `query-${index}`);

	expect(readRecents(store).length).toBe(maxRecentSearches);
	expect(readRecents(store)[0]).toBe(`query-${maxRecentSearches}`);
});
