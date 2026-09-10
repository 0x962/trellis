import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { eventApplierFor } from "@trellis/api";
import { ticketSummary, ulid } from "../../test/fixtures";
import * as mmkv from "../../test/mocks/react-native-mmkv";
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
mock.module("react-native-mmkv", () => mmkv);
mock.module("react-native-sse", () => sse);

const { startLive } = await import("./live");

const store = mmkv.createMMKV();

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

	test("opens one stream with the 25 s ping param while the app is active", () => {
		const stop = startLive(new QueryClient());
		expect(sse.instances).toHaveLength(1);
		const stream = sse.instances[0]!;
		expect(stream.url).toBe("http://h:4521/api/events?ping=25");
		expect(stream.options.headers?.["x-trellis-actor"]).toBe("human:navid");
		stop();
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
