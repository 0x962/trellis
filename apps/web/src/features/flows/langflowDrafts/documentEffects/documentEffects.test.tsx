import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import { act } from "react";
import { draft, memoryStore, receipt } from "../fixtures/fixtures";
import { mountedDraft, settleEffects } from "./fixture";

test("mounted debounce saves once and keeps publication pending separate from saved", async () => {
	const calls: FlowDocumentSaveV1Input[] = [];
	const f = await mountedDraft({
		save: async (request) => {
			calls.push(request);
			return receipt(request);
		},
	});
	try {
		await f.edit("first");
		await f.edit("second");
		expect(calls).toHaveLength(0);
		await settleEffects();
		expect(calls).toHaveLength(1);
		expect(calls[0]?.graphDocument).toEqual({ text: "second" });
		expect(f.snapshot()).toMatchObject({
			saved: true,
			saving: false,
			retained: true,
			receipt: { publication: { state: "pending" } },
		});
	} finally {
		await f.close();
	}
});

test("lost response keeps exact submission across effects and explicit retry", async () => {
	const calls: string[] = [];
	const f = await mountedDraft({
		save: async (request) => {
			calls.push(JSON.stringify(request));
			if (calls.length === 1) throw new Error("Response lost after commit.");
			return receipt(request);
		},
	});
	try {
		await f.edit("original");
		await f.flush();
		expect(f.snapshot()).toMatchObject({ failure: "network", retained: true, saved: false });
		await f.edit("newer");
		await f.detach();
		await f.render();
		await settleEffects();
		expect(calls).toHaveLength(1);
		await f.retry();
		expect(calls).toHaveLength(3);
		expect(calls[1]).toBe(calls[0]);
		expect(JSON.parse(calls[2]!).expectedVersion).toBe(JSON.parse(calls[0]!).expectedVersion + 1);
		expect(f.snapshot().saved).toBe(true);
	} finally {
		await f.close();
	}
});

test("unmount keeps the pending queue and receipt without sending newer edits", async () => {
	const pending = Promise.withResolvers<FlowDocumentV1>();
	const calls: FlowDocumentSaveV1Input[] = [];
	const f = await mountedDraft({
		save: async (request) => {
			calls.push(request);
			return calls.length === 1 ? pending.promise : receipt(request);
		},
	});
	try {
		await f.edit("first");
		await act(async () => {
			void f.value().saveNow();
		});
		await f.edit("newer");
		await f.detach();
		await act(async () => pending.resolve(receipt(calls[0]!)));
		expect(calls).toHaveLength(1);
		await f.render();
		expect(f.snapshot().draft.contentJson).toContain("newer");
		expect(f.snapshot().draft.baseVersion).toBe(calls[0]!.expectedVersion + 1);
		await f.flush();
		expect(calls).toHaveLength(2);
		expect(f.snapshot().saved).toBe(true);
	} finally {
		await f.close();
	}
});

test("remount during a pending request never creates a second queue", async () => {
	const pending = Promise.withResolvers<FlowDocumentV1>();
	const calls: FlowDocumentSaveV1Input[] = [];
	const f = await mountedDraft({
		save: async (request) => {
			calls.push(request);
			return pending.promise;
		},
	});
	try {
		await f.edit("pending");
		await act(async () => {
			void f.value().saveNow();
		});
		await f.detach();
		await f.render();
		await act(async () => {
			void f.value().saveNow();
		});
		expect(calls).toHaveLength(1);
		await act(async () => pending.resolve(receipt(calls[0]!)));
		expect(f.snapshot().saved).toBe(true);
	} finally {
		await f.close();
	}
});

test("conflict survives effect cleanup, reload, new edits, and retry", async () => {
	let calls = 0;
	const f = await mountedDraft({
		save: async () => {
			calls++;
			throw new ORPCError("FLOW_VERSION_CONFLICT");
		},
	});
	try {
		await f.edit("conflict");
		await f.flush();
		await f.detach();
		await f.render();
		await f.edit("newer conflict");
		await f.retry();
		await f.flush();
		expect(calls).toBe(1);
		expect(f.snapshot()).toMatchObject({ failure: "conflict", retained: true, saved: false });
		expect(f.snapshot().draft.contentJson).toContain("newer conflict");
	} finally {
		await f.close();
	}
});

test("host, actor, and tab changes isolate edits and late receipts", async () => {
	const pending = Promise.withResolvers<FlowDocumentV1>();
	const calls: FlowDocumentSaveV1Input[] = [];
	const f = await mountedDraft({
		save: async (request) => {
			calls.push(request);
			return calls.length === 1 ? pending.promise : receipt(request);
		},
	});
	try {
		const identity = draft().identity;
		await f.edit("scope one");
		await act(async () => {
			void f.value().saveNow();
		});
		const staleCallback = f.value().draftChanged;
		for (const [field, value] of [
			["host", "other/data"],
			["actor", "human:other"],
			["tab", "other-tab"],
		] as const) {
			await f.render({ identity: { ...identity, [field]: value } });
			await f.edit(field);
			await f.flush();
			expect(f.snapshot().draft.identity[field]).toBe(value);
		}
		await act(async () =>
			staleCallback({
				schemaVersion: 1,
				engine: "langflow",
				graphDocument: { text: "stale" },
				componentManifestHash: "c".repeat(64),
			}),
		);
		expect(f.snapshot().draft.contentJson).not.toContain("stale");
		await act(async () => pending.resolve(receipt(calls[0]!)));
		expect(f.snapshot().draft.contentJson).toContain("tab");
		await f.render({ identity });
		expect(f.snapshot()).toMatchObject({ saved: true, draft: { identity } });
		expect(f.snapshot().draft.contentJson).toContain("scope one");
		expect(f.memory.values.size).toBe(4);
	} finally {
		await f.close();
	}
});

test("storage refusal preserves memory bytes but never claims local retention", async () => {
	let calls = 0;
	const f = await mountedDraft({
		save: async (request) => {
			calls++;
			return receipt(request);
		},
	});
	try {
		f.memory.fail(true);
		await f.edit("not on disk");
		await f.flush();
		expect(f.snapshot()).toMatchObject({ retained: false, failure: "storage", saved: false });
		expect(f.value().exportDraft()).toContain("not on disk");
		expect(calls).toBe(0);
		f.memory.fail(false);
		await f.retry();
		expect(calls).toBe(1);
		expect(f.snapshot()).toMatchObject({ retained: true, saved: true });
	} finally {
		await f.close();
	}
});

test("storage read refusal reports an unavailable draft and sends nothing", async () => {
	const memory = memoryStore();
	let calls = 0;
	const storage = {
		...memory.storage,
		getItem: () => {
			throw new Error("Storage denied.");
		},
	};
	const f = await mountedDraft({
		storage,
		save: async (request) => {
			calls++;
			return receipt(request);
		},
	});
	try {
		expect(f.value().state).toMatchObject({ kind: "unavailable", reason: "storage" });
		await f.edit("cannot retain");
		await f.flush();
		expect(calls).toBe(0);
	} finally {
		await f.close();
	}
});
