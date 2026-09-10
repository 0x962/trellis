import { beforeEach, jest } from "@jest/globals";
import { AppState } from "react-native";
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
// Every test starts from a fresh install: an empty store and no open stream.
//
// react-native reports no app state under jest. A phone is in the foreground
// when a person opens the app, and the event stream opens in the foreground
// only, so every test starts active.
beforeEach(() => {
	AppState.currentState = "active";
	createMMKV().clearAll();
	resetEventSources();
});
