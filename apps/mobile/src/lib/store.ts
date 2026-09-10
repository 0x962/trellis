import { createMMKV } from "react-native-mmkv";

// The one MMKV instance of the app. Every persisted key is listed here, so a
// test can seed the store and a reader never spells a key twice.
export const store = createMMKV({ id: "trellis" });

export const keys = {
	serverUrl: "trellis-server-url",
	actorName: "trellis-actor-name",
	theme: "trellis-theme",
	queryCache: "trellis-query-cache",
} as const;
