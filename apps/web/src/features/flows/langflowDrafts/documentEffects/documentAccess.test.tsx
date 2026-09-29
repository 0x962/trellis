import { expect, test } from "bun:test";
import { pendingDocumentV1Example } from "@trellis/api";
import { act } from "react";
import { createDocumentRecovery } from "../documentRecovery";
import { createDraftStorage } from "../draftStorage";
import { draft, memoryStore, receipt } from "../fixtures/fixtures";
import { mountedDraft, settleEffects } from "./fixture";

test("grant expiry between edit and debounce blocks dispatch", async () => {
	let allowed = true;
	let calls = 0;
	const f = await mountedDraft({
		canDispatch: () => allowed,
		save: async (request) => {
			calls++;
			return receipt(request);
		},
	});
	try {
		await f.edit("before expiry");
		allowed = false;
		await settleEffects();
		expect(calls).toBe(0);
		expect(f.snapshot().draft.contentJson).toContain("before expiry");
		await f.render({ active: false });
		allowed = true;
		await f.flush();
		expect(calls).toBe(0);
		await f.render({ active: true });
		await f.flush();
		expect(calls).toBe(1);
	} finally {
		await f.close();
	}
});

test("access-end suspension survives rerenders until a new grant mounts", async () => {
	let calls = 0;
	const f = await mountedDraft({
		save: async (request) => {
			calls++;
			return receipt(request);
		},
	});
	try {
		await f.edit("kept after revoke");
		await act(async () => f.value().suspend());
		await f.render();
		await f.flush();
		expect(calls).toBe(0);
		expect(f.snapshot().suspended).toBe(true);
		await f.detach();
		await f.render();
		await f.flush();
		expect(calls).toBe(1);
	} finally {
		await f.close();
	}
});

test("two mounted tabs keep independent drafts and compare-and-set conflicts", async () => {
	const memory = memoryStore();
	let version = pendingDocumentV1Example.revision;
	const save = async (request: Parameters<typeof receipt>[0]) => {
		if (request.expectedVersion !== version) {
			const { ORPCError } = await import("@orpc/client");
			throw new ORPCError("FLOW_VERSION_CONFLICT");
		}
		version++;
		return receipt(request);
	};
	const first = await mountedDraft({ storage: memory.storage, save });
	const second = await mountedDraft({
		storage: memory.storage,
		save,
		identity: { ...draft().identity, tab: "second" },
	});
	try {
		await first.edit("first tab");
		await second.edit("second tab");
		await first.flush();
		await second.flush();
		expect(first.snapshot().saved).toBe(true);
		expect(second.snapshot()).toMatchObject({ failure: "conflict", saved: false, retained: true });
		expect(createDraftStorage(memory.storage).list(draft().identity)).toHaveLength(2);
	} finally {
		await first.close();
		await second.close();
	}
});

test("an offline abandoned draft recovers into a new tab without deleting its source", async () => {
	const memory = memoryStore();
	const source = draft();
	createDraftStorage(memory.storage).create(source);
	const recovery = createDocumentRecovery(memory.storage, source.identity);
	const bytes = recovery.exportDraft(source.identity)!;
	const copy = recovery.recover(source.identity, bytes, "recovered-tab");
	const f = await mountedDraft({ identity: copy.identity, storage: memory.storage });
	try {
		expect(f.snapshot().draft.contentJson).toBe(source.contentJson);
		await f.flush();
		expect(f.snapshot().saved).toBe(true);
		expect(recovery.exportDraft(source.identity)).toBe(bytes);
	} finally {
		await f.close();
	}
});

test("unsupported record bytes stay exportable and cannot autosave", async () => {
	const memory = memoryStore();
	const storage = createDraftStorage(memory.storage);
	storage.create(draft());
	const key = memory.storage.key(0)!;
	const bytes = ' { "version": 99, "data": "untouched" }\n';
	memory.storage.setItem(key, bytes);
	let calls = 0;
	const f = await mountedDraft({
		storage: memory.storage,
		save: async (request) => {
			calls++;
			return receipt(request);
		},
	});
	try {
		expect(f.value().state).toMatchObject({ kind: "unavailable", reason: "unsupported", bytes });
		await f.flush();
		expect(calls).toBe(0);
		expect(storage.readBytes(draft().identity)).toBe(bytes);
	} finally {
		await f.close();
	}
});

test("rollback keeps the same draft read-only and exportable", async () => {
	const f = await mountedDraft();
	try {
		await f.edit("before rollback");
		const exported = f.value().exportDraft();
		await f.render({ readOnly: true });
		await f.edit("cannot replace");
		await f.flush();
		await f.retry();
		expect(f.value().exportDraft()).toBe(exported);
		expect(f.snapshot()).toMatchObject({ saved: false, readOnly: true });
	} finally {
		await f.close();
	}
});

test("discard requires exact reviewed bytes and closes only the named draft", async () => {
	const f = await mountedDraft();
	try {
		await f.edit("reviewed");
		const before = f.value().exportDraft()!;
		await f.edit("newer");
		expect(() => f.value().discard(before)).toThrow("draft changed");
		await act(async () => f.value().discard(f.value().exportDraft()!));
		expect(f.snapshot().closed).toBe(true);
		expect(f.memory.values.size).toBe(0);
		await f.detach();
		await f.render();
		expect(f.snapshot().closed).toBe(false);
		expect(f.snapshot().saved).toBe(true);
	} finally {
		await f.close();
	}
});
