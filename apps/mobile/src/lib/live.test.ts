import { afterEach, beforeEach, describe, expect, jest, mock, spyOn, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { eventApplierFor } from "@trellis/api";
import { ticketSummary, ulid } from "../../test/fixtures";
import * as kvStore from "../../test/mocks/expo-sqlite-kv-store";
import * as sse from "../../test/mocks/react-native-sse";

type Change = (state: string) => void;

// The part of react-native's AppState the stream reads: the current state
// and the change listeners. `fire` moves the app to a state and tells every
// listener, the way the OS does.
const appState = {
	currentState: "active",
	listeners: [] as Change[],
	addEventListener: (_type: string, listener: Change) => {
		appState.listeners.push(listener);
		return {
			remove: () => {
				appState.listeners = appState.listeners.filter((item) => item !== listener);
			},
		};
	},
};

const fire = (state: string) => {
	appState.currentState = state;
	for (const listener of [...appState.listeners]) listener(state);
};

mock.module("react-native", () => ({ AppState: appState }));
mock.module("expo-sqlite/kv-store", () => kvStore);
mock.module("react-native-sse", () => sse);

const { libraryPollingInterval, reconnectCapMs, reconnectMs, startLive } = await import("./live");
const { store } = await import("./store");

// One invalidation with no filter is "invalidate all".
const invalidatedAll = (calls: unknown[][]) => calls.filter((call) => call[0] === undefined).length;

describe("startLive", () => {
	beforeEach(() => {
		store.clearAll();
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "navid");
		sse.resetEventSources();
		appState.currentState = "active";
		appState.listeners = [];
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test("opens one stream with the 25 s ping param while the app is active", () => {
		const stop = startLive(new QueryClient());
		expect(sse.instances).toHaveLength(1);
		const stream = sse.instances[0]!;
		expect(stream.url).toBe("http://h:4521/api/events?ping=25");
		expect(stream.options.headers?.["x-trellis-actor"]).toBe("human:navid");
		stop();
	});

	// react-native-sse dials again on an HTTP status error, never on a socket
	// error, which is what a phone that loses Wi-Fi gets. startLive owns every
	// reconnect, so `pollingInterval` of 0 stops the library from opening a
	// second connection beside the one startLive opens.
	test("the library never dials on its own", () => {
		const stop = startLive(new QueryClient());
		expect(libraryPollingInterval).toBe(0);
		expect(sse.instances[0]!.options.pollingInterval).toBe(libraryPollingInterval);
		stop();
	});

	// XMLHttpRequest.DONE is 4. The mobile budget is a reconnect in 1 s or less.
	test("a socket error at readyState 4 opens a second connection within 1 s", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		expect(reconnectMs).toBeLessThanOrEqual(1_000);
		sse.instances[0]!.succeed();
		sse.instances[0]!.fail(4);
		expect(sse.instances[0]!.closeCalls).toBe(1);
		expect(sse.instances).toHaveLength(1);
		jest.advanceTimersByTime(reconnectMs);
		expect(sse.instances).toHaveLength(2);
		expect(sse.instances[1]!.url).toBe("http://h:4521/api/events?ping=25");
		stop();
	});

	test("a server that stays down is asked after 1, 2, 4, 8, and 8 s", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		const waits = [1_000, 2_000, 4_000, 8_000, 8_000];
		for (const [index, wait] of waits.entries()) {
			sse.instances[index]!.fail(4);
			jest.advanceTimersByTime(wait - 1);
			expect(sse.instances).toHaveLength(index + 1);
			jest.advanceTimersByTime(1);
			expect(sse.instances).toHaveLength(index + 2);
		}
		expect(reconnectCapMs).toBe(8_000);
		stop();
	});

	test("a stream that opens puts the wait back to 1 s", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		sse.instances[0]!.fail(4);
		jest.advanceTimersByTime(1_000);
		sse.instances[1]!.succeed();
		sse.instances[1]!.fail(4);
		jest.advanceTimersByTime(1_000);
		expect(sse.instances).toHaveLength(3);
		stop();
	});

	// The server replays what it sent after this id, so a reconnect loses no
	// event. A new EventSource carries none of the first one's state.
	test("the reconnect asks for the events after the last one it saw", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		const body = { summary: ticketSummary(), fields: ["title"], batchId: ulid };
		sse.instances[0]!.emit("ticket.updated", JSON.stringify(body), `${ulid}.7`);
		sse.instances[0]!.fail(4);
		jest.advanceTimersByTime(reconnectMs);
		expect(sse.instances[1]!.options.headers?.["Last-Event-ID"]).toBe(`${ulid}.7`);
		expect(sse.instances[1]!.options.headers?.["x-trellis-actor"]).toBe("human:navid");
		stop();
	});

	// The server sends bye before it stops, so the stream ends with no error.
	test("a bye event dials again", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		sse.instances[0]!.emit("bye", JSON.stringify({ reason: "shutdown" }), `${ulid}.9`);
		expect(sse.instances[0]!.closeCalls).toBe(1);
		jest.advanceTimersByTime(reconnectMs);
		expect(sse.instances).toHaveLength(2);
		expect(sse.instances[1]!.options.headers?.["Last-Event-ID"]).toBe(`${ulid}.9`);
		stop();
	});

	test("the app in the background dials no more, and the foreground opens one", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		sse.instances[0]!.fail(4);
		fire("background");
		jest.advanceTimersByTime(60_000);
		expect(sse.instances).toHaveLength(1);
		fire("active");
		expect(sse.instances).toHaveLength(2);
		stop();
	});

	// The app switcher makes the app inactive and never backgrounds it. The
	// stream is already gone, so the return to the foreground opens one, and
	// the reconnect that was due must not open a second one.
	test("a return through inactive opens one stream, not two", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		sse.instances[0]!.fail(4);
		fire("inactive");
		fire("active");
		expect(sse.instances).toHaveLength(2);
		jest.advanceTimersByTime(60_000);
		expect(sse.instances).toHaveLength(2);
		stop();
	});

	test("the returned function cancels a reconnect that is due", () => {
		jest.useFakeTimers();
		const stop = startLive(new QueryClient());
		sse.instances[0]!.fail(4);
		stop();
		jest.advanceTimersByTime(60_000);
		expect(sse.instances).toHaveLength(1);
	});

	test("does not open a stream while the app is in the background", () => {
		appState.currentState = "background";
		const stop = startLive(new QueryClient());
		expect(sse.instances).toHaveLength(0);
		fire("active");
		expect(sse.instances).toHaveLength(1);
		stop();
	});

	test("closes on background and reopens with invalidate all on foreground", () => {
		const queryClient = new QueryClient();
		const invalidate = spyOn(queryClient, "invalidateQueries");
		const stop = startLive(queryClient);
		expect(sse.instances).toHaveLength(1);
		fire("background");
		expect(sse.instances[0]!.closeCalls).toBe(1);
		expect(sse.instances).toHaveLength(1);
		fire("active");
		expect(sse.instances).toHaveLength(2);
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(invalidatedAll(invalidate.mock.calls)).toBe(1);
		stop();
	});

	test("a stream message reaches applyEvent and reset invalidates all", () => {
		const queryClient = new QueryClient();
		const apply = spyOn(eventApplierFor(queryClient), "applyEvent");
		const invalidate = spyOn(queryClient, "invalidateQueries");
		const stop = startLive(queryClient);
		const body = { summary: ticketSummary(), fields: ["title"], batchId: ulid };
		sse.instances[0]!.emit("ticket.updated", JSON.stringify(body));
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply).toHaveBeenCalledWith({ type: "ticket.updated", ...body });
		expect(invalidate).not.toHaveBeenCalled();
		sse.instances[0]!.emit("reset", JSON.stringify({ reason: "restart" }));
		expect(invalidatedAll(invalidate.mock.calls)).toBeGreaterThanOrEqual(1);
		stop();
	});
});
