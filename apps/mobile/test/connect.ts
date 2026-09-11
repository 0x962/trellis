import { store } from "../src/lib/store";
import { type Recorder, recordFetch } from "./record";
import { actorName, directFetch, serverUrl } from "./server";

const realFetch = globalThis.fetch;

const storeServer = () => {
	store.set("trellis-server-url", serverUrl);
	store.set("trellis-actor-name", actorName);
};

// Points the app at the spawned server and records every RPC call it makes.
// `restore` on the recorder puts the real fetch back.
export const connect = (): Recorder => {
	storeServer();
	return recordFetch(directFetch);
};

// A stored server that no socket answers: every request rejects the way a
// closed port does.
export const disconnect = () => {
	storeServer();
	globalThis.fetch = (() => Promise.reject(new TypeError("Network request failed"))) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
};

// A stored server whose requests never settle.
export const hang = () => {
	storeServer();
	globalThis.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
};
