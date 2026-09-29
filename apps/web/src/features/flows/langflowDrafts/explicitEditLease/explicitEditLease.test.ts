import { expect, test } from "bun:test";
import { type ConversionEditIntentV1, type FlowDocumentSaveV1Input, type FlowDocumentV1, pendingDocumentV1Example } from "@trellis/api";
import { createDraftStorage } from "../draftStorage";
import { content, draft, memoryStore, receipt } from "../fixtures/fixtures";
import { createSaveQueue } from "../saveQueue";

function setup(save: (request: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1> = async (request) => receipt(request)) {
	const memory = memoryStore();
	const storage = createDraftStorage(memory.storage);
	const initial = draft();
	initial.contentJson = initial.savedContentJson;
	const document = {
		...pendingDocumentV1Example, ...content("saved"), revision: initial.baseVersion,
		flow: { ...pendingDocumentV1Example.flow, version: initial.baseVersion },
		publication: { state: "pending", revision: initial.baseVersion },
	} as FlowDocumentV1;
	let allowed = true;
	const restore = () => createSaveQueue({
		draft: storage.read(initial.identity).state === "absent" ? initial : JSON.parse(storage.readBytes(initial.identity)!),
		storage, save, readOnly: false,
		requestId: () => crypto.randomUUID(), now: () => new Date().toISOString(), canDispatch: () => allowed,
	});
	return { memory, storage, document, queue: restore(), restore, expire: () => { allowed = false; } };
}

const intentFor = (base: Extract<FlowDocumentV1, { engine: "langflow" }>): ConversionEditIntentV1 => ({
	schemaVersion: 1, flowId: base.flow.id, expectedVersion: base.revision,
	expectedDocumentHash: base.documentHash, componentManifestHash: base.componentManifestHash,
	enginePackageDigest: "d".repeat(64), requestId: crypto.randomUUID(),
	edits: [{ kind: "set-flow-briefing", briefing: "keep exact intent" }],
});

test("the lease waits for the active save and returns its acknowledged base", async () => {
	const pending = Promise.withResolvers<FlowDocumentV1>();
	let submitted!: FlowDocumentSaveV1Input;
	const f = setup((request) => { submitted = request; return pending.promise; });
	f.queue.edit(content("ordinary save"));
	const saving = f.queue.flush();
	const acquiring = f.queue.beginExplicitEdit(f.document);
	const requestBytes = f.queue.snapshot().draft.submission?.requestJson;
	f.queue.resume();
	expect(() => f.queue.edit(content("too late"))).toThrow("read-only");
	expect(f.queue.snapshot().draft.submission?.requestJson).toBe(requestBytes);
	pending.resolve(receipt(submitted));
	await saving;
	const lease = await acquiring;
	expect(lease.base.revision).toBe(submitted.expectedVersion + 1);
	expect(lease.base.graphDocument).toEqual({ text: "ordinary save" });
	lease.release();
});

test("Cancel preserves bytes and leaves autosave suspended after expiry", async () => {
	const f = setup();
	const before = JSON.stringify(f.queue.snapshot().draft);
	const lease = await f.queue.beginExplicitEdit(f.document);
	f.queue.resume();
	expect(() => f.queue.edit(content("blocked"))).toThrow("read-only");
	f.expire();
	lease.release();
	expect(JSON.stringify(f.queue.snapshot().draft)).toBe(before);
	expect(f.queue.snapshot()).toMatchObject({ suspended: true, explicitEdit: false });
});

test("newer graph bytes prevent a lease and remain unchanged", async () => {
	const f = setup();
	f.queue.edit(content("newer"));
	const before = JSON.stringify(f.queue.snapshot().draft);
	await expect(f.queue.beginExplicitEdit(f.document)).rejects.toThrow("Resolve the browser draft");
	expect(JSON.stringify(f.queue.snapshot().draft)).toBe(before);
	expect(f.queue.snapshot().suspended).toBe(true);
});

test("unknown outcomes retain exact intent through reload and cannot be discarded", async () => {
	const f = setup();
	const lease = await f.queue.beginExplicitEdit(f.document);
	const intent = intentFor(lease.base);
	await expect(lease.dispatch(intent, async () => { throw new Error("Response lost."); })).rejects.toThrow("Response lost");
	const bytes = lease.pendingBytes();
	expect(bytes).toBe(JSON.stringify(intent));
	expect(() => lease.release()).toThrow("Resolve the pending edit");
	expect(() => f.storage.discard(draft().identity, f.storage.readBytes(draft().identity)!)).toThrow("pending explicit edit");
	const restored = f.restore();
	restored.resume();
	expect(() => restored.edit(content("cannot overwrite"))).toThrow("read-only");
	const replay = await restored.beginExplicitEdit(f.document);
	let sent = "";
	await replay.replay(async (request) => {
		sent = JSON.stringify(request);
		return { state: "pending", requestId: request.requestId };
	});
	expect(sent).toBe(bytes);
	expect(() => replay.release()).toThrow("Resolve the pending edit");
});

test("a blocked result releases unchanged graph bytes without resume", async () => {
	const f = setup();
	const before = JSON.stringify(f.queue.snapshot().draft);
	const lease = await f.queue.beginExplicitEdit(f.document);
	await lease.dispatch(intentFor(lease.base), async () => ({ state: "blocked", diagnostics: [] }));
	lease.release();
	expect(JSON.stringify(f.queue.snapshot().draft)).toBe(before);
	expect(f.queue.snapshot().suspended).toBe(true);
});

test("only the committed document replaces the clean base and requires a fresh grant", async () => {
	const f = setup();
	const lease = await f.queue.beginExplicitEdit(f.document);
	const document = {
		...f.document, ...content("regenerated"), revision: f.document.revision + 1,
		flow: { ...f.document.flow, version: f.document.revision + 1 },
		publication: { state: "pending", revision: f.document.revision + 1 },
	} as FlowDocumentV1;
	await lease.dispatch(intentFor(lease.base), async (request) => ({ requestId: request.requestId, document }));
	expect(() => lease.release()).toThrow("Resolve the pending edit");
	expect(() => lease.acceptCommittedDocument(f.document)).toThrow("committed document");
	f.memory.fail(true);
	expect(() => lease.acceptCommittedDocument(document)).toThrow("could not retain");
	expect(lease.pendingBytes()).not.toBeNull();
	f.memory.fail(false);
	lease.acceptCommittedDocument(document);
	expect(f.queue.snapshot()).toMatchObject({ suspended: true, explicitEdit: false, saved: true, retained: true });
	expect(f.queue.snapshot().draft.contentJson).toContain("regenerated");
	expect(f.queue.snapshot().draft.explicitEdit).toBeUndefined();
});

test("storage refusal and expired access prevent intent dispatch", async () => {
	const f = setup();
	const lease = await f.queue.beginExplicitEdit(f.document);
	let calls = 0;
	const send = async (request: ConversionEditIntentV1) => {
		calls++;
		return { state: "pending" as const, requestId: request.requestId };
	};
	f.memory.fail(true);
	await expect(lease.dispatch(intentFor(lease.base), send)).rejects.toThrow("could not retain");
	f.memory.fail(false);
	f.expire();
	await expect(lease.dispatch(intentFor(lease.base), send)).rejects.toThrow("access ended");
	expect(calls).toBe(0);
});
