import type { DraftStore } from "../../../../lib/draftTransfer/types";
import type { DraftIdentity, DraftRecord } from "../draftRecord";
import { createDraftStorage } from "../draftStorage";

type Scope = Omit<DraftIdentity, "tab">;

export function createDocumentRecovery(rawStorage: DraftStore, scope: Scope) {
	const storage = createDraftStorage(rawStorage);
	const assertScope = (identity: DraftIdentity) => {
		if (identity.host !== scope.host || identity.actor !== scope.actor || identity.flow !== scope.flow)
			throw new Error("This draft belongs to another host, actor, or flow.");
	};
	const exportDraft = (identity: DraftIdentity) => {
		assertScope(identity);
		return storage.readBytes(identity);
	};
	const discard = (identity: DraftIdentity, expectedBytes: string) => {
		assertScope(identity);
		storage.discard(identity, expectedBytes);
	};
	const recover = (identity: DraftIdentity, expectedBytes: string, tab: string) => {
		assertScope(identity);
		const source = storage.read(identity);
		if (source.state !== "available") throw new Error("Export this draft. Its format cannot be recovered.");
		if (source.bytes !== expectedBytes) throw new Error("The draft changed. Read it before recovery.");
		const copy = { ...source.record, identity: { ...identity, tab }, updatedAt: new Date().toISOString() };
		storage.create(copy);
		return copy;
	};
	const preserveLegacy = (record: DraftRecord, bytes: string) => {
		assertScope(record.identity);
		storage.create({ ...record, contentJson: bytes, legacyBytes: bytes, blocked: "unsupported" });
	};
	return { list: () => storage.list(scope), exportDraft, discard, recover, preserveLegacy };
}
