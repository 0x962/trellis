import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createTrellisClient, type TrellisClient } from "@trellis/api";
import { actorHeader, keys, store } from "./store";

let cached: { key: string; client: TrellisClient } | undefined;

// The typed client for the stored server URL and name. One client lives per
// (URL, name) pair. A change to either key in MMKV makes the next call build
// a new one. The global fetch is read per request, so a test can replace it.
export const getClient = (): TrellisClient => {
	const url = store.getString(keys.serverUrl)!;
	const name = store.getString(keys.actorName)!;
	const key = `${url}\n${name}`;
	if (cached?.key !== key) {
		cached = {
			key,
			client: createTrellisClient(url, actorHeader(name), (request, init) => globalThis.fetch(request, init)),
		};
	}
	return cached.client;
};

// These helpers use the current client configuration for query keys and hook options.
export const getQueries = () => createTanstackQueryUtils(getClient());
