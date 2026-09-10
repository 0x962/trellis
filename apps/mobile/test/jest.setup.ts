import { beforeEach, jest } from "@jest/globals";
import { queryClient } from "../src/lib/queryClient";
import { createMMKV } from "./mocks/react-native-mmkv";
import { resetEventSources } from "./mocks/react-native-sse";

// expo-linking reads the URI scheme and the dev server host from the
// expo-constants manifest, and jest-expo gives that manifest no app.json.
// This hands it the real one plus the host a development build carries.
jest.mock("expo-constants", () => {
	const actual = jest.requireActual<typeof import("expo-constants")>("expo-constants");
	const { expo } = jest.requireActual<{ expo: Record<string, unknown> }>("../app.json");
	return {
		__esModule: true,
		...actual,
		default: { ...actual.default, expoConfig: { ...expo, hostUri: "localhost:8081" } },
	};
});

// jest.config.js maps react-native-mmkv and react-native-sse to the two
// mocks, so this file and the module under test share one instance of each.
// Every test starts from a fresh install: an empty store, an empty query
// cache, and no open stream.
beforeEach(() => {
	createMMKV().clearAll();
	queryClient.clear();
	resetEventSources();
});
