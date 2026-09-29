import { ORPCError } from "@orpc/client";
import {
	type FlowDocumentSaveV1Input,
	FlowDocumentSaveV1InputSchema,
	type FlowDocumentV1,
	FlowDocumentV1Schema,
} from "@trellis/api";
import type { DraftContent, DraftRecord } from "../draftRecord";
import type { createDraftStorage } from "../draftStorage";

type Failure = "network" | "storage" | "conflict" | "unsupported";
type Options = {
	draft: DraftRecord;
	storage: ReturnType<typeof createDraftStorage>;
	save: (request: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1>;
	requestId: () => string;
	now: () => string;
	readOnly: boolean;
	canDispatch?: () => boolean;
	retained?: boolean;
};

export function createSaveQueue(options: Options) {
	let draft = structuredClone(options.draft);
	let failure: Failure | null = draft.blocked;
	let error: unknown = null;
	let retained = options.retained ?? false;
	let receipt: FlowDocumentV1 | null = null;
	let active: Promise<void> | null = null;
	let closed = false;
	let suspended = false;
	let readOnly = options.readOnly;
	const listeners = new Set<() => void>();
	const notify = () => {
		for (const listener of listeners) listener();
	};
	const persist = () => {
		try {
			options.storage.write(draft);
			retained = true;
			return true;
		} catch (cause) {
			retained = false;
			failure = "storage";
			error = cause;
			return false;
		} finally {
			notify();
		}
	};
	const edit = (content: DraftContent) => {
		if (closed || suspended || readOnly) throw new Error("This draft is read-only.");
		draft = { ...draft, contentJson: JSON.stringify(content), updatedAt: options.now() };
		persist();
	};
	const drain = async () => {
		while (!closed && !suspended && !readOnly && failure === null && (options.canDispatch?.() ?? true)) {
			if (draft.submission === null && draft.contentJson === draft.savedContentJson) return;
			let request: FlowDocumentSaveV1Input;
			try {
				let submission = draft.submission;
				if (submission === null) {
					const requestJson = JSON.stringify({
						...JSON.parse(draft.contentJson),
						flow: draft.identity.flow,
						expectedVersion: draft.baseVersion,
						requestId: options.requestId(),
					});
					submission = { requestJson, contentJson: draft.contentJson };
					draft = { ...draft, submission };
				}
				request = JSON.parse(submission.requestJson);
				FlowDocumentSaveV1InputSchema.parse(request);
				if (request.flow !== draft.identity.flow || request.expectedVersion !== draft.baseVersion)
					throw new Error("The submitted request does not match this draft.");
			} catch (cause) {
				draft = { ...draft, blocked: "unsupported" };
				failure = "unsupported";
				error = cause;
				persist();
				return;
			}
			if (!persist()) return;
			if (closed || suspended || readOnly || !(options.canDispatch?.() ?? true)) return;
			const submitted = draft.submission!;
			let result: FlowDocumentV1;
			try {
				result = FlowDocumentV1Schema.parse(await options.save(request));
				if (result.flow.id !== draft.identity.flow || result.revision <= request.expectedVersion)
					throw new Error("The save receipt does not identify the submitted flow revision.");
			} catch (cause) {
				const code = cause instanceof ORPCError ? cause.code : null;
				const blocked =
					code === "FLOW_VERSION_CONFLICT" || code === "FLOW_REQUEST_CONFLICT"
						? "conflict"
						: code === "FLOW_UNSUPPORTED_FORMAT"
							? "unsupported"
							: null;
				draft = { ...draft, blocked };
				failure = blocked ?? "network";
				error = cause;
				persist();
				return;
			}
			receipt = result;
			draft = {
				...draft,
				baseVersion: result.revision,
				savedContentJson: submitted.contentJson,
				submission: null,
			};
			if (!persist()) return;
		}
	};
	const flush = (): Promise<void> => {
		if (active !== null) return active;
		active = drain().finally(() => {
			active = null;
			notify();
		});
		notify();
		return active;
	};
	const retry = () => {
		if (active !== null) return active;
		if (draft.blocked !== null || closed || suspended || readOnly) return Promise.resolve();
		failure = null;
		error = null;
		if (!persist()) return Promise.resolve();
		return flush();
	};
	const discard = () => {
		if (active !== null) throw new Error("Wait for the submitted save before discard.");
		const bytes = options.storage.readBytes(draft.identity);
		if (bytes !== null) options.storage.discard(draft.identity, JSON.stringify(draft));
		closed = true;
		retained = false;
		notify();
	};
	const snapshot = () => ({
		draft: structuredClone(draft),
		failure,
		error,
		retained,
		receipt: structuredClone(receipt),
		saving: active !== null,
		saved: draft.submission === null && draft.contentJson === draft.savedContentJson,
		readOnly: readOnly || closed,
		closed,
		suspended,
	});
	const suspend = () => {
		suspended = true;
		notify();
	};
	const resume = () => {
		suspended = false;
		notify();
	};
	const setReadOnly = (value: boolean) => {
		readOnly = value;
		notify();
	};
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	return { edit, flush, retry, discard, snapshot, suspend, resume, setReadOnly, subscribe };
}
