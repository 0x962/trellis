import {
	type PersistedClient,
	type Persister,
	persistQueryClientRestore,
	persistQueryClientSave,
	persistQueryClientSubscribe,
} from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";
import { keys } from "./keys";

// The part of MMKV the persister touches.
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

// The whole query cache under one MMKV key, as one JSON string.
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

// Writes a snapshot after every cache change until the returned function runs.
export const subscribePersist = (queryClient: QueryClient, store: CacheStore) =>
	persistQueryClientSubscribe({ queryClient, persister: createPersister(store) });
