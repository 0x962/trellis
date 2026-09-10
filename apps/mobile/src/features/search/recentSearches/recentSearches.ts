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
export const readRecents = (_store: RecentStore): string[] => {
	throw new Error("readRecents is not built yet.");
};

// Puts one query at the front. A query already in the list moves to the
// front and stays there once.
export const pushRecent = (_store: RecentStore, _query: string): void => {
	throw new Error("pushRecent is not built yet.");
};
