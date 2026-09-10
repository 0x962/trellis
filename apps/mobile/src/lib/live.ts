import type { QueryClient } from "@tanstack/react-query";
import { type EventName, eventApplierFor, eventNames } from "@trellis/api";
import { AppState } from "react-native";
import EventSource from "react-native-sse";
import { actorHeader } from "./server";
import { keys, store } from "./store";

// The server sends a comment every this many seconds, so iOS never closes an
// idle socket.
export const pingSeconds = 25;

// react-native-sse waits this many milliseconds before it dials the dropped
// stream again. Its own default is 5 s, and the mobile budget is 1 s.
export const reconnectMs = 1_000;

// Opens the event stream of the stored server while the app is in the
// foreground. Every event goes to the applier of `queryClient`, which patches
// the cache. The stream closes when the app goes to the background. On return
// to the foreground a new stream opens and every query is invalidated, so
// what happened in between is fetched instead of replayed. The returned
// function stops the stream and the AppState listener.
export const startLive = (queryClient: QueryClient) => {
	const applier = eventApplierFor(queryClient);
	let stream: EventSource<EventName> | undefined;

	const open = () => {
		const url = store.getString(keys.serverUrl)!;
		const name = store.getString(keys.actorName)!;
		stream = new EventSource<EventName>(`${url}/api/events?ping=${pingSeconds}`, {
			headers: { "x-trellis-actor": actorHeader(name) },
			pollingInterval: reconnectMs,
		});
		for (const type of eventNames) {
			stream.addEventListener(type, (event) => {
				applier.applyEvent({ type, ...JSON.parse(event.data ?? "{}") });
			});
		}
	};

	const close = () => {
		stream?.close();
		stream = undefined;
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
