// The name of every value the app keeps in MMKV. This file imports no
// native module, so a test reads a name without an MMKV instance.
export const keys = {
	serverUrl: "trellis-server-url",
	actorName: "trellis-actor-name",
	theme: "trellis-theme",
	queryCache: "trellis-query-cache",
} as const;
