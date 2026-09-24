import type { ProviderCheck, ProviderModels } from "@trellis/api";

type Saved<T> = { at: number; result: Promise<T> };
type ProviderCache = { models?: Saved<ProviderModels>; check?: Saved<ProviderCheck> };
const caches = new Map<string, ProviderCache>();

// Provider reads take their cache object in the same transaction as the provider row.
// After invalidation, an older request writes only to its detached object.
export const cacheOf = (home: string, id: string): ProviderCache => {
	const key = `${home}:${id}`;
	let cache = caches.get(key);
	if (cache === undefined) {
		cache = {};
		caches.set(key, cache);
	}
	return cache;
};

export const invalidateProvider = (home: string, id: string): void => {
	caches.delete(`${home}:${id}`);
};
