import { beforeEach, jest } from "@jest/globals";
import { queryClient } from "../src/lib/queryClient";
import { notificationAsync } from "./mocks/expo-haptics";
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

// jest.config.js maps react-native-mmkv, react-native-sse, and expo-haptics
// to the three mocks, so this file and the module under test share one
// instance of each. Every test starts from a fresh install: an empty store,
// an empty query cache, no open stream, and no haptic fired.
beforeEach(() => {
	createMMKV().clearAll();
	queryClient.clear();
	resetEventSources();
	notificationAsync.mockClear();
});
// The gesture handler mocks its native module, so `fireGestureHandler`
// drives a pan. FlashList measures a 400 by 900 viewport, so a list draws rows.
require("react-native-gesture-handler/jestSetup");
require("@shopify/flash-list/jestSetup");
