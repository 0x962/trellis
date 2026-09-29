import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import { createDraftStorage } from "../draftStorage";
import { content, draft, memoryStore, receipt } from "../fixtures/fixtures";
import { createSaveQueue } from "./saveQueue";

function setup(save: (request: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1>, readOnly = false) {
	const memory = memoryStore();
	const storage = createDraftStorage(memory.storage);
	const options = {
		draft: draft(),
		storage,
		save,
		requestId: () => crypto.randomUUID(),
		now: () => "2026-09-29T18:00:00Z",
		readOnly,
	};
	storage.create(options.draft);
	return { memory, storage, options, queue: createSaveQueue(options) };
}

describe("versioned save queue", () => {
	test("keeps both tab drafts when compare-and-set rejects the second tab", async () => {
		let version = 2;
		const fixture = setup(async (request) => {
			if (request.expectedVersion !== version) throw new ORPCError("FLOW_VERSION_CONFLICT");
			version++;
			return receipt(request);
		});
		const secondDraft = { ...draft(), identity: { ...draft().identity, tab: "tab-b" } };
		fixture.storage.create(secondDraft);
		const second = createSaveQueue({ ...fixture.options, draft: secondDraft });
		await Promise.all([fixture.queue.flush(), second.flush()]);
		expect(fixture.queue.snapshot().saved).toBe(true);
		expect(second.snapshot()).toMatchObject({ saved: false, failure: "conflict", retained: true });
		expect(fixture.storage.list(draft().identity)).toHaveLength(2);
	});

	test("retains legacy source after conversion and acknowledgement without a text ceiling", async () => {
		const fixture = setup(async (request) => receipt(request));
		const converted = { ...draft(), legacyBytes: ' { "graph": [] }\n' };
		const queue = createSaveQueue({ ...fixture.options, draft: converted });
		queue.edit(content("x".repeat(500_001)));
		await queue.flush();
		expect(queue.snapshot()).toMatchObject({ saved: true, retained: true });
		expect(JSON.parse(fixture.storage.readBytes(converted.identity)!).legacyBytes).toBe(converted.legacyBytes);
		queue.discard();
		expect(fixture.storage.read(converted.identity).state).toBe("absent");
	});

	test("serializes saves and retains newer edits with the acknowledged version", async () => {
		const waiting = Promise.withResolvers<FlowDocumentV1>();
		const calls: FlowDocumentSaveV1Input[] = [];
		const { queue, storage } = setup(async (request) => {
			calls.push(request);
			return calls.length === 1 ? waiting.promise : receipt(request);
		});
		const first = queue.flush();
		expect(queue.flush()).toBe(first);
		queue.edit(content("newer"));
		expect(calls).toHaveLength(1);
		const stored = storage.read(draft().identity);
		expect(stored.state).toBe("available");
		if (stored.state !== "available") throw new Error("Draft missing.");
		expect(stored.record.contentJson).toContain("newer");
		expect(stored.record.submission?.contentJson).toContain("edit");
		waiting.resolve(receipt(calls[0]!));
		await first;
		expect(calls.map((call) => call.expectedVersion)).toEqual([2, 3]);
		expect(calls[0]?.requestId).not.toBe(calls[1]?.requestId);
		expect(queue.snapshot()).toMatchObject({
			saved: true,
			retained: true,
			receipt: { publication: { state: "pending" } },
		});
	});

	test("replays the same submitted bytes after a lost response and reload", async () => {
		const calls: string[] = [];
		const fixture = setup(async (request) => {
			calls.push(JSON.stringify(request));
			throw new Error("Response lost after commit.");
		});
		await fixture.queue.flush();
		fixture.queue.edit(content("newer"));
		await fixture.queue.flush();
		expect(calls).toHaveLength(1);
		const restored = fixture.storage.read(draft().identity);
		if (restored.state !== "available") throw new Error("Draft missing.");
		const recovered = createSaveQueue({
			...fixture.options,
			draft: restored.record,
			save: async (request) => {
				calls.push(JSON.stringify(request));
				return receipt(request);
			},
		});
		await recovered.flush();
		expect(calls[1]).toBe(calls[0]);
		expect(JSON.parse(calls[2]!).expectedVersion).toBe(3);
		expect(recovered.snapshot().saved).toBe(true);
	});

	for (const code of ["FLOW_VERSION_CONFLICT", "FLOW_REQUEST_CONFLICT", "FLOW_UNSUPPORTED_FORMAT"]) {
		test(`stops automatic writes and retries after ${code}`, async () => {
			let calls = 0;
			const fixture = setup(async () => {
				calls++;
				throw new ORPCError(code);
			});
			await fixture.queue.flush();
			fixture.queue.edit(content("retained after refusal"));
			await fixture.queue.retry();
			await fixture.queue.flush();
			const recovered = createSaveQueue({ ...fixture.options, draft: fixture.queue.snapshot().draft });
			await recovered.flush();
			expect(calls).toBe(1);
			expect(fixture.queue.snapshot()).toMatchObject({ retained: true, saved: false });
			expect(fixture.queue.snapshot().draft.submission).not.toBeNull();
		});
	}

	test("does not send a request until browser storage retains it", async () => {
		const calls: FlowDocumentSaveV1Input[] = [];
		const { queue, memory } = setup(async (request) => {
			calls.push(request);
			return receipt(request);
		});
		memory.fail(true);
		queue.edit(content("memory only"));
		await queue.flush();
		expect(queue.snapshot()).toMatchObject({ retained: false, failure: "storage", saved: false });
		expect(calls).toHaveLength(0);
		memory.fail(false);
		await queue.retry();
		expect(calls).toHaveLength(1);
		expect(queue.snapshot()).toMatchObject({ retained: true, saved: true });
	});

	test("retains a replayable request when storage fails after acknowledgement", async () => {
		const waiting = Promise.withResolvers<FlowDocumentV1>();
		const fixture = setup(() => waiting.promise);
		const pending = fixture.queue.flush();
		const submitted = fixture.storage.readBytes(draft().identity)!;
		const request = JSON.parse(JSON.parse(submitted).submission.requestJson);
		fixture.memory.fail(true);
		waiting.resolve(receipt(request));
		await pending;
		expect(fixture.queue.snapshot()).toMatchObject({ retained: false, failure: "storage", saved: true });
		expect(fixture.storage.readBytes(draft().identity)).toBe(submitted);
	});

	test("requires an explicit retry for a network error", async () => {
		let calls = 0;
		const { queue } = setup(async (request) => {
			if (++calls === 1) throw new Error("Offline.");
			return receipt(request);
		});
		await queue.flush();
		const bytes = queue.snapshot().draft.submission?.requestJson;
		await queue.flush();
		expect(calls).toBe(1);
		await queue.retry();
		expect(calls).toBe(2);
		expect(bytes).toBeDefined();
		expect(queue.snapshot().saved).toBe(true);
	});

	test("keeps unsupported content and legacy bytes for export", async () => {
		const fixture = setup(async () => {
			throw new Error("Must not call the server.");
		});
		const unknown = { ...draft(), contentJson: '{"schemaVersion":2}', legacyBytes: "legacy bytes\n" };
		const queue = createSaveQueue({ ...fixture.options, draft: unknown });
		await queue.flush();
		expect(queue.snapshot()).toMatchObject({ failure: "unsupported", retained: true });
		expect(JSON.parse(fixture.storage.readBytes(unknown.identity)!)).toMatchObject({
			contentJson: unknown.contentJson,
			legacyBytes: unknown.legacyBytes,
		});
	});

	test("keeps rollback drafts read-only and exportable", async () => {
		let calls = 0;
		const fixture = setup(async (request) => {
			calls++;
			return receipt(request);
		}, true);
		const bytes = fixture.storage.readBytes(draft().identity);
		await fixture.queue.flush();
		await fixture.queue.retry();
		expect(() => fixture.queue.edit(content("change"))).toThrow("read-only");
		expect(calls).toBe(0);
		expect(fixture.storage.readBytes(draft().identity)).toBe(bytes);
	});

	test("refuses discard during a save or after another writer changes the draft", async () => {
		const waiting = Promise.withResolvers<FlowDocumentV1>();
		const fixture = setup(() => waiting.promise);
		const pending = fixture.queue.flush();
		expect(() => fixture.queue.discard()).toThrow("Wait for");
		waiting.resolve(receipt(JSON.parse(fixture.queue.snapshot().draft.submission!.requestJson)));
		await pending;
		fixture.storage.write({ ...fixture.queue.snapshot().draft, contentJson: "newer bytes" });
		expect(() => fixture.queue.discard()).toThrow("The draft changed");
	});
});
