// The name of every value the app keeps in the store. This file imports no
// native module, so a test reads a name without an open store.
export const keys = {
	serverUrl: "trellis-server-url",
	actorName: "trellis-actor-name",
	theme: "trellis-theme",
	queryCache: "trellis-query-cache",
} as const;
