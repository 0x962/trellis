import { expect, test } from "bun:test";
import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import { createDraftStorage } from "../draftStorage";
import { content, draft, memoryStore, receipt } from "../fixtures/fixtures";
import { createSaveQueue } from "../saveQueue";

const setup = (save: (request: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1>, canDispatch = () => true) => {
	const memory = memoryStore();
	const storage = createDraftStorage(memory.storage);
	return createSaveQueue({
		draft: draft(),
		storage,
		save,
		canDispatch,
		readOnly: false,
		requestId: () => crypto.randomUUID(),
		now: () => new Date().toISOString(),
	});
};

test("suspend keeps newer bytes after the current receipt and needs explicit resume", async () => {
	const pending = Promise.withResolvers<FlowDocumentV1>();
	const calls: FlowDocumentSaveV1Input[] = [];
	const queue = setup(async (request) => {
		calls.push(request);
		return calls.length === 1 ? pending.promise : receipt(request);
	});
	const saving = queue.flush();
	queue.edit(content("newer"));
	queue.suspend();
	pending.resolve(receipt(calls[0]!));
	await saving;
	await queue.flush();
	await queue.retry();
	expect(calls).toHaveLength(1);
	expect(queue.snapshot()).toMatchObject({ suspended: true, saved: false, retained: true });
	expect(queue.snapshot().draft.contentJson).toContain("newer");
	queue.resume();
	await queue.flush();
	expect(calls.map((request) => request.expectedVersion)).toEqual([2, 3]);
	expect(queue.snapshot().saved).toBe(true);
});

test("expiry at the persistence boundary prevents network dispatch", async () => {
	let allowed = true;
	let calls = 0;
	const queue = setup(
		async (request) => {
			calls++;
			return receipt(request);
		},
		() => allowed,
	);
	const unsubscribe = queue.subscribe(() => {
		if (queue.snapshot().draft.submission !== null) allowed = false;
	});
	await queue.flush();
	expect(calls).toBe(0);
	expect(queue.snapshot().draft.submission).not.toBeNull();
	unsubscribe();
	allowed = true;
	await queue.flush();
	expect(calls).toBe(1);
});

test("rollback stops drain and resume cannot clear read-only access", async () => {
	let calls = 0;
	const queue = setup(async (request) => {
		calls++;
		return receipt(request);
	});
	queue.setReadOnly(true);
	queue.suspend();
	queue.resume();
	await queue.flush();
	expect(calls).toBe(0);
	expect(() => queue.edit(content("change"))).toThrow("read-only");
	expect(queue.snapshot().draft.contentJson).toContain("edit");
});
