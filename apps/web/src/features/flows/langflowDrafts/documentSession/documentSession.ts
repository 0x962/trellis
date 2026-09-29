import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import type { DraftStore } from "../../../../lib/draftTransfer/types";
import type { DraftIdentity, DraftRecord } from "../draftRecord";
import { createDraftStorage } from "../draftStorage";
import { createSaveQueue } from "../saveQueue";

export type DocumentSessionOptions = {
	identity: DraftIdentity;
	document: FlowDocumentV1;
	storage: DraftStore;
};
export type DocumentAccess = {
	save: (request: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1>;
	canDispatch: () => boolean;
	readOnly: boolean;
};
export const documentScopeKey = ({ host, actor, flow, tab }: DraftIdentity) => JSON.stringify([host, actor, flow, tab]);

function createDocumentSession({ identity, document, storage: rawStorage }: DocumentSessionOptions) {
	const storage = createDraftStorage(rawStorage);
	let owner: DocumentAccess | null = null;
	const stored = storage.read(identity);
	if (stored.state === "unsupported") return { kind: "unsupported" as const, bytes: stored.bytes };
	const contentJson = JSON.stringify({
		schemaVersion: document.schemaVersion,
		engine: document.engine,
		graphDocument: document.graphDocument,
		componentManifestHash: document.componentManifestHash,
	});
	const draft: DraftRecord =
		stored.state === "available"
			? stored.record
			: {
					version: 1,
					identity: { ...identity },
					baseVersion: document.revision,
					updatedAt: new Date().toISOString(),
					contentJson,
					savedContentJson: contentJson,
					legacyBytes: null,
					submission: null,
					blocked: null,
				};
	const queue = createSaveQueue({
		draft,
		storage,
		readOnly: false,
		retained: stored.state === "available",
		requestId: () => crypto.randomUUID(),
		now: () => new Date().toISOString(),
		canDispatch: () => owner !== null && !owner.readOnly && owner.canDispatch(),
		save: (request) => {
			if (owner === null || owner.readOnly || !owner.canDispatch()) throw new Error("Editor access ended.");
			return owner.save(request);
		},
	});
	queue.suspend();
	let snapshot = queue.snapshot();
	queue.subscribe(() => {
		snapshot = queue.snapshot();
	});
	const attach = (access: DocumentAccess) => {
		if (owner !== null) throw new Error("This draft already has an editor. Open another tab identity.");
		owner = access;
		queue.setReadOnly(access.readOnly);
		queue.resume();
		return () => {
			if (owner !== access) return;
			owner = null;
			queue.suspend();
		};
	};
	return { kind: "queue" as const, queue, attach, snapshot: () => snapshot };
}

const sessions = new WeakMap<DraftStore, Map<string, ReturnType<typeof createDocumentSession>>>();

export function documentSession(options: DocumentSessionOptions) {
	let byScope = sessions.get(options.storage);
	if (byScope === undefined) {
		byScope = new Map();
		sessions.set(options.storage, byScope);
	}
	const key = documentScopeKey(options.identity);
	let session = byScope.get(key);
	if (session?.kind === "queue" && session.snapshot().closed) session = undefined;
	if (session === undefined) {
		session = createDocumentSession(options);
		if (session.kind === "queue") byScope.set(key, session);
	}
	return session;
}
