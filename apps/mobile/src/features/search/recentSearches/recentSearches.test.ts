import { describe, expect, test } from "bun:test";
import { maxRecentSearches, pushRecent, readRecents, recentSearchesKey, replaceRecent } from "./recentSearches";

// A stand-in for the app store that records every key the module names.
const memoryStore = (seed: Record<string, string> = {}) => {
	const values = new Map(Object.entries(seed));
	const touched: string[] = [];
	return {
		values,
		touched,
		store: {
			getString: (key: string) => {
				touched.push(key);
				return values.get(key);
			},
			set: (key: string, value: string) => {
				touched.push(key);
				values.set(key, value);
			},
		},
	};
};

describe("recent searches", () => {
	test("recent searches read back newest first", () => {
		const { store } = memoryStore();
		for (const query of ["oauth", "terminal", "scrollback"]) pushRecent(store, query);
		expect(readRecents(store)).toEqual(["scrollback", "terminal", "oauth"]);
	});

	test("a repeated query moves to the front and never duplicates", () => {
		const { store } = memoryStore({ [recentSearchesKey]: JSON.stringify(["scrollback", "terminal", "oauth"]) });
		pushRecent(store, "oauth");
		expect(readRecents(store)).toEqual(["oauth", "scrollback", "terminal"]);
	});

	test("a query replaces the earlier query of its typing session and keeps the others", () => {
		const { store } = memoryStore({ [recentSearchesKey]: JSON.stringify(["terminal", "oauth"]) });
		replaceRecent(store, undefined, "log");
		replaceRecent(store, "log", "login");
		replaceRecent(store, "login", "login bug");
		expect(readRecents(store)).toEqual(["login bug", "terminal", "oauth"]);
	});

	test("the recents list stays at its cap", () => {
		const full = Array.from({ length: maxRecentSearches }, (_, index) => `query-${index}`);
		const { store } = memoryStore({ [recentSearchesKey]: JSON.stringify(full) });
		pushRecent(store, "oauth");
		const recents = readRecents(store);
		expect(recents).toHaveLength(maxRecentSearches);
		expect(recents[0]).toBe("oauth");
		expect(recents).not.toContain(full[full.length - 1]);
	});

	test("a store without the key reads as an empty list", () => {
		const { store, touched } = memoryStore();
		expect(readRecents(store)).toEqual([]);
		pushRecent(store, "oauth");
		expect(new Set(touched)).toEqual(new Set([recentSearchesKey]));
		expect(recentSearchesKey).toBe("trellis-recent-searches");
	});
});
