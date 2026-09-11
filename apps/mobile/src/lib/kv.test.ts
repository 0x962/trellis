import { describe, expect, test } from "bun:test";
import { createKvStore, type KvBackend } from "./kv";

// A synchronous backend over a map, the shape expo-sqlite/kv-store's
// `SQLiteStorage` has. `reads` counts every `getItemSync`, so a test can
// prove a listener re-read the key it was told about and no other.
const mapBackend = (seed: Record<string, string> = {}) => {
	const values = new Map(Object.entries(seed));
	const reads: string[] = [];
	const backend: KvBackend = {
		getItemSync: (key) => {
			reads.push(key);
			const value = values.get(key);
			return value === undefined ? null : value;
		},
		setItemSync: (key, value) => {
			values.set(key, value);
		},
		removeItemSync: (key) => values.delete(key),
		getAllKeysSync: () => [...values.keys()],
		clearSync: () => {
			values.clear();
			return true;
		},
	};
	return { backend, values, reads };
};

describe("the key-value store", () => {
	// The backend answers `null` for a key it holds nothing for. Every reader
	// in the app treats an absent value as `undefined`, so the store converts.
	test("an absent key reads undefined and a stored key reads its string", () => {
		const { backend } = mapBackend({ "trellis-theme": "light" });
		const store = createKvStore(backend);
		expect(store.getString("trellis-theme")).toBe("light");
		expect(store.getString("trellis-server-url")).toBeUndefined();
		expect(store.contains("trellis-theme")).toBe(true);
		expect(store.contains("trellis-server-url")).toBe(false);
	});

	test("a write reaches the backend and a remove takes the value back out", () => {
		const { backend, values } = mapBackend();
		const store = createKvStore(backend);
		store.set("trellis-actor-name", "navid");
		expect(values.get("trellis-actor-name")).toBe("navid");
		store.remove("trellis-actor-name");
		expect(store.getString("trellis-actor-name")).toBeUndefined();
	});

	// A screen mounts one listener per key it paints. The store names the key
	// that changed, so a screen re-reads that key and leaves the others alone.
	test("a write, a remove, and clearAll each name the key they changed", () => {
		const { backend } = mapBackend();
		const store = createKvStore(backend);
		const changed: string[] = [];
		const listener = store.addOnValueChangedListener((key) => changed.push(key));

		store.set("trellis-theme", "dark");
		expect(changed).toEqual(["trellis-theme"]);

		store.remove("trellis-theme");
		expect(changed).toEqual(["trellis-theme", "trellis-theme"]);

		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "navid");
		changed.length = 0;
		store.clearAll();
		expect(changed.sort()).toEqual(["trellis-actor-name", "trellis-server-url"]);

		listener.remove();
		store.set("trellis-theme", "light");
		expect(changed.sort()).toEqual(["trellis-actor-name", "trellis-server-url"]);
	});

	test("clearAll empties the backend", () => {
		const { backend, values } = mapBackend({ "trellis-theme": "light" });
		const store = createKvStore(backend);
		store.clearAll();
		expect(values.size).toBe(0);
		expect(store.getString("trellis-theme")).toBeUndefined();
	});

	// Two listeners of one store both hear every change, and one that removes
	// itself while the store notifies does not stop the other.
	test("every listener hears a change", () => {
		const { backend } = mapBackend();
		const store = createKvStore(backend);
		const first: string[] = [];
		const second: string[] = [];
		const firstListener = store.addOnValueChangedListener((key) => {
			first.push(key);
			firstListener.remove();
		});
		store.addOnValueChangedListener((key) => second.push(key));
		store.set("trellis-theme", "dark");
		store.set("trellis-theme", "light");
		expect(first).toEqual(["trellis-theme"]);
		expect(second).toEqual(["trellis-theme", "trellis-theme"]);
	});
});
