import { describe, expect, test } from "bun:test";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { persistClient, persistOptions, restoreClient } from "./storage";

const key = "trellis-query-cache";
const hour = 3_600_000;
const limit = 5 * 1024 * 1024;

// The subset of MMKV the persister touches, over a map. `writes` counts
// every `set`, so a test can prove the persister never wrote.
const memoryStore = (seed: Record<string, string> = {}) => {
	const values = new Map(Object.entries(seed));
	let writes = 0;
	const store = {
		getString: (name: string) => values.get(name),
		set: (name: string, value: string) => {
			writes += 1;
			values.set(name, value);
		},
		remove: (name: string) => values.delete(name),
	};
	return { store, values, writes: () => writes };
};

const seeded = (data: unknown) => {
	const client = new QueryClient();
	client.setQueryData(["tickets", "list", { project: "CDE" }], data);
	return client;
};

const page = { items: [{ identifier: "CDE-42", title: "First" }], nextCursor: null };

// Rewrites the stored snapshot's timestamp, so the restore sees a snapshot
// of the given age.
const age = (values: Map<string, string>, ms: number) => {
	const snapshot = JSON.parse(values.get(key)!) as { timestamp: number };
	values.set(key, JSON.stringify({ ...snapshot, timestamp: Date.now() - ms }));
};

describe("query cache persistence", () => {
	test("a cache under 5 MB round-trips through MMKV", async () => {
		const source = seeded(page);
		const { store, values } = memoryStore();
		await persistClient(source, store);
		expect([...values.keys()]).toEqual([key]);
		expect(values.get(key)!.length).toBeLessThan(limit);
		const target = new QueryClient();
		await restoreClient(target, store);
		expect(dehydrate(target)).toEqual(dehydrate(source));
	});

	test("a cache over 5 MB is refused and the previous snapshot stays", async () => {
		const previous = "x".repeat(1024);
		const { store, values, writes } = memoryStore({ [key]: previous });
		const source = seeded({ blob: "y".repeat(limit + 1) });
		await persistClient(source, store);
		expect(values.get(key)).toBe(previous);
		expect(writes()).toBe(0);
	});

	test("a snapshot older than 24 h expires on restore", async () => {
		expect(persistOptions.maxAge).toBe(86_400_000);
		const stale = memoryStore();
		await persistClient(seeded(page), stale.store);
		age(stale.values, 25 * hour);
		const expired = new QueryClient();
		await restoreClient(expired, stale.store);
		expect(expired.getQueryCache().getAll()).toHaveLength(0);

		const recent = memoryStore();
		await persistClient(seeded(page), recent.store);
		age(recent.values, 23 * hour);
		const kept = new QueryClient();
		await restoreClient(kept, recent.store);
		expect(kept.getQueryCache().getAll()).toHaveLength(1);
		expect(kept.getQueryData<typeof page>(["tickets", "list", { project: "CDE" }])).toEqual(page);
	});
});
