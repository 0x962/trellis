import { createTanstackQueryUtils, type RouterUtils } from "@orpc/tanstack-query";
import { createTrellisClient, type TrellisClient } from "@trellis/api";
import { actorHeader } from "./server";
import { keys, store } from "./store";

export type Orpc = RouterUtils<TrellisClient>;

let cached: { key: string; client: TrellisClient; orpc: Orpc } | undefined;

// The typed client for the stored server URL and name. One client lives per
// (URL, name) pair. A change to either key in the store makes the next call build
// a new one. The global fetch is read per request, so a test can replace it.
export const getClient = (): TrellisClient => {
	const url = store.getString(keys.serverUrl)!;
	const name = store.getString(keys.actorName)!;
	const key = `${url}\n${name}`;
	if (cached?.key !== key) {
		const client = createTrellisClient(url, actorHeader(name), (request, init) => globalThis.fetch(request, init));
		cached = { key, client, orpc: createTanstackQueryUtils(client) };
	}
	return cached.client;
};

// The TanStack Query utils over the same client. Every query key they build
// is an oRPC key, `[path, {input, type}]`, which is the shape the live
// applier patches and invalidates.
export const getOrpc = (): Orpc => {
	getClient();
	return cached!.orpc;
};

// The browse screens call this name. It returns the same cached utils as
// getOrpc, so every screen builds the same query keys.
export const getQueries = getOrpc;
