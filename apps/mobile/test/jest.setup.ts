import { afterAll, afterEach, beforeEach, jest } from "@jest/globals";
import { realScheduler } from "@trellis/api";
import { AppState } from "react-native";
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
//
// react-native reports no app state under jest. A phone is in the foreground
// when a person opens the app, and the event stream opens in the foreground
// only, so every test starts active.
beforeEach(() => {
	AppState.currentState = "active";
	createMMKV().clearAll();
	queryClient.clear();
	// A collected query arms a timer as long as the app's collection time, a
	// day. Such a timer outlives the file and keeps the jest worker alive, so
	// the cache of a test run never collects.
	const defaults = queryClient.getDefaultOptions();
	queryClient.setDefaultOptions({
		...defaults,
		queries: { ...defaults.queries, gcTime: Number.POSITIVE_INFINITY },
	});
	resetEventSources();
	notificationAsync.mockClear();
});

// The event applier of @trellis/api waits on timers from `realScheduler`
// before it refetches the queries an event touched, up to 4 s for the inbox.
// A timer that is still pending when the last test of a file ends keeps the
// jest worker alive, and jest kills the worker. This wrapper records every
// pending timer and cancels it after each test. The applier reads
// `realScheduler.setTimeout` at each call, so it uses the wrapper.
const pendingTimers = new Set<unknown>();
const { setTimeout: startTimer, clearTimeout: stopTimer } = realScheduler;
realScheduler.setTimeout = (callback, delayMs) => {
	const handle = startTimer(() => {
		pendingTimers.delete(handle);
		callback();
	}, delayMs);
	pendingTimers.add(handle);
	return handle;
};
realScheduler.clearTimeout = (handle) => {
	pendingTimers.delete(handle);
	stopTimer(handle);
};
afterEach(() => {
	for (const handle of pendingTimers) stopTimer(handle);
	pendingTimers.clear();
});

// A query the cache holds arms a collection timer when its last observer
// leaves, and the app collects after a day. That timer outlives the file and
// keeps the jest worker alive, so the cache empties after the last unmount.
afterAll(() => queryClient.clear());

// The gesture handler mocks its native module, so `fireGestureHandler`
// drives a pan. FlashList measures a 400 by 900 viewport, so a list draws rows.
require("react-native-gesture-handler/jestSetup");
require("@shopify/flash-list/jestSetup");
