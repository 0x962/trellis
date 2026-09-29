import {
	type ConversionEditIntentV1,
	ConversionEditIntentV1Schema,
	type FlowDocumentActionResultV1,
	type FlowDocumentV1,
} from "@trellis/api";
import type { DraftRecord } from "../draftRecord";

type Send = (intent: ConversionEditIntentV1) => Promise<FlowDocumentActionResultV1>;
type Options = {
	read: () => { draft: DraftRecord; failed: boolean; receipt: FlowDocumentV1 | null };
	write: (draft: DraftRecord, document?: FlowDocumentV1) => boolean;
	pause: () => Promise<void>;
	canDispatch: () => boolean;
	changed: () => void;
};

export function createExplicitEditLease(options: Options) {
	let held = options.read().draft.explicitEdit !== undefined;
	let lease: ReturnType<typeof createLease> | null = null;
	let acquiring = false;
	const unlock = () => {
		held = false;
		lease = null;
		options.changed();
	};
	function createLease(document: FlowDocumentV1) {
		if (document.engine !== "langflow") throw new Error("Convert this document before an explicit edit.");
		const base = structuredClone(document);
		let live = true;
		let sending = false;
		let unknown = options.read().draft.explicitEdit !== undefined;
		let committed: FlowDocumentV1 | null = null;
		let blocked = false;
		const assertLive = () => {
			if (!live) throw new Error("This explicit edit lease ended.");
		};
		const assertIntent = (intent: ConversionEditIntentV1) => {
			if (
				intent.flowId !== base.flow.id ||
				intent.expectedVersion !== base.revision ||
				intent.expectedDocumentHash !== base.documentHash ||
				intent.componentManifestHash !== base.componentManifestHash
			)
				throw new Error("The intent does not match the leased document.");
		};
		const sendPending = async (send: Send) => {
			assertLive();
			if (sending) throw new Error("Wait for the explicit edit response.");
			if (blocked || committed !== null) throw new Error("Resolve the explicit edit receipt first.");
			const pending = options.read().draft.explicitEdit;
			if (pending === undefined) throw new Error("This lease has no intent to replay.");
			const intent = ConversionEditIntentV1Schema.parse(JSON.parse(pending.requestJson));
			assertIntent(intent);
			if (!options.canDispatch()) throw new Error("Editor access ended. Preserve the explicit edit for replay.");
			sending = true;
			try {
				if (!options.write(options.read().draft)) throw new Error("The browser could not retain the explicit edit.");
				if (!options.canDispatch()) throw new Error("Editor access ended. Preserve the explicit edit for replay.");
				unknown = true;
				const result = await send(intent);
				if ("state" in result) {
					if (result.state === "blocked") {
						blocked = true;
						unknown = false;
					} else if (result.requestId !== intent.requestId) throw new Error("The edit receipt has another request ID.");
				} else {
					if (result.requestId !== intent.requestId) throw new Error("The edit receipt has another request ID.");
					committed = structuredClone(result.document);
					unknown = false;
				}
				return result;
			} finally {
				sending = false;
				options.changed();
			}
		};
		return {
			base: structuredClone(base),
			pendingBytes: () => options.read().draft.explicitEdit?.requestJson ?? null,
			dispatch: async (value: ConversionEditIntentV1, send: Send) => {
				assertLive();
				if (options.read().draft.explicitEdit !== undefined) throw new Error("Replay the retained intent first.");
				const intent = ConversionEditIntentV1Schema.parse(value);
				assertIntent(intent);
				if (!options.canDispatch()) throw new Error("Editor access ended.");
				if (
					!options.write({
						...options.read().draft,
						explicitEdit: { requestJson: JSON.stringify(intent), baseDocument: structuredClone(base) },
					})
				)
					throw new Error("The browser could not retain the explicit edit.");
				return sendPending(send);
			},
			replay: sendPending,
			release: () => {
				assertLive();
				if (sending || unknown || committed !== null) throw new Error("Resolve the pending edit before release.");
				const next = { ...options.read().draft };
				if (next.explicitEdit !== undefined) {
					delete next.explicitEdit;
					if (!options.write(next)) throw new Error("The browser could not release the explicit edit.");
				}
				live = false;
				unlock();
			},
			acceptCommittedDocument: (document: FlowDocumentV1) => {
				assertLive();
				if (committed === null || JSON.stringify(document) !== JSON.stringify(committed))
					throw new Error("Use the committed document from this edit receipt.");
				if (document.flow.id !== base.flow.id || document.revision <= base.revision)
					throw new Error("The committed document does not advance this flow.");
				const contentJson = JSON.stringify({
					schemaVersion: document.schemaVersion,
					engine: document.engine,
					graphDocument: document.graphDocument,
					componentManifestHash: document.componentManifestHash,
				});
				const next = {
					...options.read().draft,
					baseVersion: document.revision,
					contentJson,
					savedContentJson: contentJson,
				};
				delete next.explicitEdit;
				if (!options.write(next, document)) throw new Error("The browser could not retain the committed document.");
				live = false;
				unlock();
			},
		};
	}
	const beginExplicitEdit = async (document: FlowDocumentV1) => {
		if (lease !== null) return lease;
		if (acquiring) throw new Error("An explicit edit already waits for the current save.");
		acquiring = true;
		held = true;
		try {
			await options.pause();
			const state = options.read();
			const pending = state.draft.explicitEdit;
			if (pending !== undefined) {
				if (
					pending.baseDocument.flow.id !== state.draft.identity.flow ||
					pending.baseDocument.revision !== state.draft.baseVersion
				)
					throw new Error("The retained edit does not match this draft.");
				lease = createLease(pending.baseDocument);
				return lease;
			}
			if (state.failed || state.draft.submission !== null || state.draft.contentJson !== state.draft.savedContentJson)
				throw new Error("Resolve the browser draft before an explicit edit.");
			const base = state.receipt ?? document;
			if (base.flow.id !== state.draft.identity.flow || base.revision !== state.draft.baseVersion)
				throw new Error("Reload the saved document before an explicit edit.");
			lease = createLease(base);
			return lease;
		} catch (error) {
			if (options.read().draft.explicitEdit === undefined) unlock();
			throw error;
		} finally {
			acquiring = false;
		}
	};
	return { beginExplicitEdit, held: () => held };
}
