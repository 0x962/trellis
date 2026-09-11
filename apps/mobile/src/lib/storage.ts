import {
	type PersistedClient,
	type Persister,
	persistQueryClientRestore,
	persistQueryClientSave,
} from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";
import { keys } from "./keys";

// The part of the store the persister touches.
export type CacheStore = {
	getString: (key: string) => string | undefined;
	set: (key: string, value: string) => void;
	remove: (key: string) => unknown;
};

// A snapshot over this many bytes is not written; the previous one stays.
export const cacheLimitBytes = 5 * 1024 * 1024;

// A snapshot older than a day restores nothing.
export const persistOptions = { maxAge: 86_400_000 } as const;

const encoder = new TextEncoder();

// The whole query cache under one store key, as one JSON string.
export const createPersister = (store: CacheStore): Persister => ({
	persistClient: (client: PersistedClient) => {
		const json = JSON.stringify(client);
		if (encoder.encode(json).byteLength > cacheLimitBytes) return;
		store.set(keys.queryCache, json);
	},
	restoreClient: () => {
		const json = store.getString(keys.queryCache);
		return json === undefined ? undefined : (JSON.parse(json) as PersistedClient);
	},
	removeClient: () => {
		store.remove(keys.queryCache);
	},
});

export const persistClient = (queryClient: QueryClient, store: CacheStore) =>
	persistQueryClientSave({ queryClient, persister: createPersister(store) });

export const restoreClient = (queryClient: QueryClient, store: CacheStore) =>
	persistQueryClientRestore({ queryClient, persister: createPersister(store), maxAge: persistOptions.maxAge });

// The longest a cache change waits for its write to the store.
export const persistIntervalMs = 1_000;

// Writes a snapshot of the whole cache one second after a change, and stops
// when the returned function runs. One stream event patches many queries and
// the cache fires an event for each patch, so a write per event would
// serialize the whole cache dozens of times a second. The changes of a window
// share the write that closes it, and that write carries the state at its end.
export const subscribePersist = (queryClient: QueryClient, store: CacheStore) => {
	const persister = createPersister(store);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const schedule = () => {
		if (timer !== undefined) return;
		timer = setTimeout(() => {
			timer = undefined;
			void persistQueryClientSave({ queryClient, persister });
		}, persistIntervalMs);
	};

	const queries = queryClient.getQueryCache().subscribe(schedule);
	const mutations = queryClient.getMutationCache().subscribe(schedule);

	return () => {
		clearTimeout(timer);
		queries();
		mutations();
	};
};
