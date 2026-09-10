// The MMKV key that holds the recent searches, as one JSON array of strings.
export const recentSearchesKey = "trellis-recent-searches";

// The number of queries the list keeps. An older query drops off the end.
export const maxRecentSearches = 8;

// The part of MMKV this module touches.
export type RecentStore = {
	getString: (key: string) => string | undefined;
	set: (key: string, value: string) => void;
};

// The stored queries, newest first.
export const readRecents = (store: RecentStore): string[] => {
	const stored = store.getString(recentSearchesKey);
	return stored === undefined ? [] : (JSON.parse(stored) as string[]);
};

// Puts one query at the front in place of `replaced`, the query that an
// earlier step of the same typing session stored. A query already in the
// list moves to the front and stays there once.
export const replaceRecent = (store: RecentStore, replaced: string | undefined, query: string): void => {
	const kept = readRecents(store).filter((recent) => recent !== query && recent !== replaced);
	store.set(recentSearchesKey, JSON.stringify([query, ...kept].slice(0, maxRecentSearches)));
};

// Puts one query at the front. A query already in the list moves to the
// front and stays there once.
export const pushRecent = (store: RecentStore, query: string): void => replaceRecent(store, undefined, query);
