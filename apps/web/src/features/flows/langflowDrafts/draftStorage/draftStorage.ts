import type { DraftStore } from "../../../../lib/draftTransfer/types";
import { type DraftIdentity, DraftIdentitySchema, type DraftRecord, DraftRecordSchema } from "../draftRecord";

const prefix = "trellis.flow-document-draft.v1.";
const keyOf = ({ host, actor, flow, tab }: DraftIdentity) => prefix + JSON.stringify([host, actor, flow, tab]);

export function createDraftStorage(storage: DraftStore) {
	const readBytes = (identity: DraftIdentity) => storage.getItem(keyOf(identity));
	const read = (identity: DraftIdentity) => {
		const bytes = readBytes(identity);
		if (bytes === null) return { state: "absent" as const };
		try {
			const record = DraftRecordSchema.parse(JSON.parse(bytes));
			if (keyOf(record.identity) !== keyOf(identity)) throw new Error("The draft identity does not match.");
			return { state: "available" as const, record, bytes };
		} catch {
			return { state: "unsupported" as const, bytes };
		}
	};
	const write = (record: DraftRecord) => storage.setItem(keyOf(record.identity), JSON.stringify(record));
	const create = (record: DraftRecord) => {
		if (readBytes(record.identity) !== null) throw new Error("Recover or discard the existing draft first.");
		write(record);
	};
	const list = (scope: Omit<DraftIdentity, "tab">) => {
		const copies: { identity: DraftIdentity; bytes: string }[] = [];
		for (let index = 0; index < storage.length; index++) {
			const key = storage.key(index);
			if (key === null || !key.startsWith(prefix)) continue;
			const [host, actor, flow, tab] = JSON.parse(key.slice(prefix.length));
			const identity = DraftIdentitySchema.parse({ host, actor, flow, tab });
			if (host !== scope.host || actor !== scope.actor || flow !== scope.flow) continue;
			const bytes = storage.getItem(key);
			if (bytes !== null) copies.push({ identity, bytes });
		}
		return copies;
	};
	const discard = (identity: DraftIdentity, expectedBytes: string) => {
		if (readBytes(identity) !== expectedBytes) throw new Error("The draft changed. Read it before discard.");
		storage.removeItem(keyOf(identity));
	};
	return { read, readBytes, write, create, list, discard };
}
