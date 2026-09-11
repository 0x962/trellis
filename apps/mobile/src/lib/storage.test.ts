import { afterEach, describe, expect, jest, test } from "bun:test";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { keys } from "./keys";
import { persistClient, persistIntervalMs, persistOptions, restoreClient, subscribePersist } from "./storage";

// `keys` names the stored values and opens no native module, so this file
// runs on its own without another file that replaces the store first.
const key = keys.queryCache;
const hour = 3_600_000;
const limit = 5 * 1024 * 1024;

// The subset of the store the persister touches, over a map. `writes` counts
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

// The write runs inside a timer callback and returns a promise. This lets
// that promise settle, so the store holds the snapshot before the count.
const settle = () => new Promise((resolve) => process.nextTick(resolve));

describe("query cache persistence", () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test("a cache under 5 MB round-trips through the store", async () => {
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

	// One stream event patches many queries, and the cache fires an event for
	// each patch. A write per event would serialize the whole cache dozens of
	// times a second, so the writes wait for the end of a one second window.
	test("a burst of 50 patches in one second writes once", async () => {
		jest.useFakeTimers();
		const client = new QueryClient();
		const { store, values, writes } = memoryStore();
		const stop = subscribePersist(client, store);

		for (let index = 0; index < 50; index += 1) client.setQueryData(["tickets", "list", { page: index }], page);
		expect(writes()).toBe(0);

		jest.advanceTimersByTime(persistIntervalMs);
		await settle();
		expect(writes()).toBe(1);
		const snapshot = JSON.parse(values.get(key)!) as { clientState: { queries: unknown[] } };
		expect(snapshot.clientState.queries).toHaveLength(50);

		stop();
	});

	// The second window holds the state at its end, so a person who leaves the
	// app one second after a change still finds that change in the snapshot.
	test("a second burst writes once more, and the stopped subscription writes nothing", async () => {
		jest.useFakeTimers();
		const client = new QueryClient();
		const { store, writes } = memoryStore();
		const stop = subscribePersist(client, store);

		client.setQueryData(["tickets", "list", {}], page);
		jest.advanceTimersByTime(persistIntervalMs);
		await settle();
		expect(writes()).toBe(1);

		for (let index = 0; index < 50; index += 1) client.setQueryData(["tickets", "get", index], page);
		jest.advanceTimersByTime(persistIntervalMs);
		await settle();
		expect(writes()).toBe(2);

		stop();
		client.setQueryData(["tickets", "list", { after: "stop" }], page);
		jest.advanceTimersByTime(persistIntervalMs * 10);
		await settle();
		expect(writes()).toBe(2);
	});

	test("one second is the window", () => {
		expect(persistIntervalMs).toBe(1_000);
	});
});
