import { expect, test } from "bun:test";
import { createDraftStorage } from "../draftStorage";
import { draft, memoryStore } from "../fixtures/fixtures";
import { createDocumentRecovery } from "./documentRecovery";

test("abandoned tab recovery preserves source bytes and request identity", () => {
	const memory = memoryStore();
	const storage = createDraftStorage(memory.storage);
	const source = { ...draft(), submission: { requestJson: "original request", contentJson: "original edit" } };
	storage.create(source);
	const recovery = createDocumentRecovery(memory.storage, source.identity);
	const bytes = recovery.exportDraft(source.identity)!;
	const copy = recovery.recover(source.identity, bytes, "new-tab");
	expect(copy.submission).toEqual(source.submission);
	expect(recovery.exportDraft(source.identity)).toBe(bytes);
	expect(recovery.list()).toHaveLength(2);
	expect(() => recovery.recover(source.identity, bytes, "new-tab")).toThrow("existing draft");
});

test("recovery refuses another actor or host and stale discard bytes", () => {
	const memory = memoryStore();
	const source = draft();
	const storage = createDraftStorage(memory.storage);
	storage.create(source);
	const recovery = createDocumentRecovery(memory.storage, source.identity);
	for (const identity of [
		{ ...source.identity, actor: "human:other" },
		{ ...source.identity, host: "other" },
	])
		expect(() => recovery.exportDraft(identity)).toThrow("another host, actor, or flow");
	expect(() => recovery.discard(source.identity, "old bytes")).toThrow("draft changed");
	recovery.discard(source.identity, recovery.exportDraft(source.identity)!);
	expect(recovery.list()).toHaveLength(0);
});

test("unsupported legacy bytes stay complete and storage refusal propagates", () => {
	const memory = memoryStore();
	const source = draft();
	const recovery = createDocumentRecovery(memory.storage, source.identity);
	const legacy = ` { "old": "${"x".repeat(500_001)}" }\n`;
	memory.fail(true);
	expect(() => recovery.preserveLegacy(source, legacy)).toThrow("Storage quota exceeded");
	expect(recovery.list()).toHaveLength(0);
	memory.fail(false);
	recovery.preserveLegacy(source, legacy);
	const saved = JSON.parse(recovery.exportDraft(source.identity)!);
	expect(saved).toMatchObject({ legacyBytes: legacy, contentJson: legacy, blocked: "unsupported" });
});
