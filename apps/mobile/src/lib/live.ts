import type { QueryClient } from "@tanstack/react-query";
import { type EventName, eventApplierFor, eventNames } from "@trellis/api";
import { AppState } from "react-native";
import EventSource from "react-native-sse";
import { actorHeader } from "./server";
import { keys, store } from "./store";

// The server sends a comment every this many seconds, so iOS never closes an
// idle socket.
export const pingSeconds = 25;

// react-native-sse dials again on an HTTP status error and never on a socket
// error, which is what a phone that loses Wi-Fi gets. `startLive` owns every
// reconnect, and 0 stops the library from opening a second connection beside
// the one `startLive` opens.
export const libraryPollingInterval = 0;

// The wait before the first reconnect.
export const reconnectMs = 1_000;

// The longest wait between two reconnects. A server that stays down is asked
// once every 8 s.
export const reconnectCapMs = 8_000;

// The wait after `attempt` reconnects that opened nothing: 1, 2, 4, 8, 8 s.
export const reconnectDelay = (attempt: number) => Math.min(reconnectMs * 2 ** attempt, reconnectCapMs);

// Opens the event stream of the stored server while the app is in the
// foreground. Every event goes to the applier of `queryClient`, which patches
// the cache. The stream closes when the app goes to the background. On return
// to the foreground a new stream opens and every query is invalidated, so
// what happened in between is fetched instead of replayed.
//
// A stream that drops in the foreground opens again after the wait above. The
// new stream sends the id of the last event it saw as `Last-Event-ID`, and the
// server answers with the events after that id, so a reconnect loses none.
// The returned function stops the stream, the pending reconnect, and the
// AppState listener.
export const startLive = (queryClient: QueryClient) => {
	const applier = eventApplierFor(queryClient);
	let stream: EventSource<EventName> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let attempt = 0;
	let lastEventId: string | undefined;

	const open = () => {
		// A reconnect that is due belongs to the stream this call replaces.
		clearTimeout(timer);
		timer = undefined;
		const url = store.getString(keys.serverUrl)!;
		const name = store.getString(keys.actorName)!;
		const headers: Record<string, string> = { "x-trellis-actor": actorHeader(name) };
		if (lastEventId !== undefined) headers["Last-Event-ID"] = lastEventId;
		stream = new EventSource<EventName>(`${url}/api/events?ping=${pingSeconds}`, {
			headers,
			pollingInterval: libraryPollingInterval,
		});
		// A stream that reaches the server puts the wait back to 1 s, so one
		// long outage does not slow the reconnect after the next short one.
		stream.addEventListener("open", () => {
			attempt = 0;
		});
		stream.addEventListener("error", () => dialAgain());
		for (const type of eventNames) {
			stream.addEventListener(type, (event) => {
				if (event.lastEventId !== null) lastEventId = event.lastEventId;
				applier.applyEvent({ type, ...JSON.parse(event.data ?? "{}") });
				// `bye` is the last event of a server that stops. The socket
				// ends with no error, so nothing else asks for a reconnect.
				if (type === "bye") dialAgain();
			});
		}
	};

	const close = () => {
		clearTimeout(timer);
		timer = undefined;
		stream?.close();
		stream = undefined;
	};

	const dialAgain = () => {
		const wait = reconnectDelay(attempt);
		attempt += 1;
		close();
		timer = setTimeout(open, wait);
	};

	if (AppState.currentState === "active") open();

	const subscription = AppState.addEventListener("change", (state) => {
		if (state === "active") {
			if (stream !== undefined) return;
			open();
			void queryClient.invalidateQueries();
		} else if (state === "background") {
			close();
		}
	});

	return () => {
		subscription.remove();
		close();
	};
};
