import { describe, expect, test } from "bun:test";
import { draft, memoryStore } from "../fixtures/fixtures";
import { createDraftStorage } from "./draftStorage";

describe("versioned draft storage", () => {
	test("isolates hosts, actors, flows, and tabs", () => {
		const memory = memoryStore();
		const store = createDraftStorage(memory.storage);
		const first = draft();
		const variants = [
			first,
			{ ...first, identity: { ...first.identity, host: "host-b/data-a" } },
			{ ...first, identity: { ...first.identity, actor: "human:two" } },
			{ ...first, identity: { ...first.identity, flow: "another-flow" } },
			{ ...first, identity: { ...first.identity, tab: "tab-b" } },
		];
		for (const record of variants) store.create(record);
		expect(memory.storage.length).toBe(5);
		expect(store.list(first.identity).map((copy) => copy.identity.tab)).toEqual(["tab-a", "tab-b"]);
		store.discard(first.identity, JSON.stringify(first));
		expect(store.read(first.identity).state).toBe("absent");
		expect(memory.storage.length).toBe(4);
	});

	test("retains abandoned offline drafts and exact legacy bytes without expiration", () => {
		const memory = memoryStore();
		const record = { ...draft(), updatedAt: "2001-01-01T00:00:00Z", legacyBytes: ' { "graph": [] }\n' };
		createDraftStorage(memory.storage).create(record);
		const reopened = createDraftStorage(memory.storage);
		expect(reopened.read(record.identity)).toMatchObject({ state: "available", record });
		expect(reopened.list(record.identity)[0]?.bytes).toBe(JSON.stringify(record));
	});

	test("exports unsupported envelopes without conversion or replacement", () => {
		const memory = memoryStore();
		const store = createDraftStorage(memory.storage);
		const record = draft();
		store.create(record);
		const bytes = JSON.stringify({ ...record, version: 7 });
		memory.storage.setItem(memory.storage.key(0)!, bytes);
		expect(store.read(record.identity)).toEqual({ state: "unsupported", bytes });
		expect(store.readBytes(record.identity)).toBe(bytes);
		expect(() => store.create(record)).toThrow("Recover or discard");
		expect(() => store.discard(record.identity, JSON.stringify(record))).toThrow("The draft changed");
		expect(store.readBytes(record.identity)).toBe(bytes);
	});

	test("reports storage failure instead of a retained copy", () => {
		const memory = memoryStore();
		memory.fail(true);
		const store = createDraftStorage(memory.storage);
		expect(() => store.create(draft())).toThrow("Storage quota exceeded");
		expect(store.list(draft().identity)).toEqual([]);
	});
});
