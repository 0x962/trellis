import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
	type DocumentAccess,
	type DocumentSessionOptions,
	documentScopeKey,
	documentSession,
} from "../../../../langflowDrafts/documentSession";
import type { DraftContent } from "../../../../langflowDrafts/draftRecord";
import type { createSaveQueue } from "../../../../langflowDrafts/saveQueue";

type Queue = ReturnType<typeof createSaveQueue>;
type Snapshot = ReturnType<Queue["snapshot"]>;
export type DocumentEditorFrame = {
	suspendEditing: () => Promise<DraftContent>;
	resumeEditing: () => boolean;
};
export type DocumentAutosaveOptions = DocumentSessionOptions & DocumentAccess & { active: boolean };
export type DocumentAutosaveState =
	| { kind: "loading" }
	| { kind: "unavailable"; reason: "storage" | "unsupported"; error: unknown; bytes: string | null }
	| { kind: "ready"; snapshot: Snapshot };

export function useDocumentAutosave(options: DocumentAutosaveOptions) {
	const scope = documentScopeKey(options.identity);
	const [view, setView] = useState<{ scope: string; state: DocumentAutosaveState }>({
		scope,
		state: { kind: "loading" },
	});
	const current = useRef<{
		scope: string;
		queue: Queue;
		release: () => void;
		requiresFreshFrame: boolean;
		timer?: ReturnType<typeof setTimeout>;
	} | null>(null);
	const latest = useRef(options);
	const committedQueue = useRef<Queue | null>(null);
	useLayoutEffect(() => {
		latest.current = options;
	});
	useLayoutEffect(() => {
		let session: ReturnType<typeof documentSession>;
		try {
			session = documentSession({ ...latest.current, storage: options.storage });
		} catch (error) {
			setView({ scope, state: { kind: "unavailable", reason: "storage", error, bytes: null } });
			return;
		}
		if (session.kind === "unsupported") {
			setView({ scope, state: { kind: "unavailable", reason: "unsupported", error: null, bytes: session.bytes } });
			return;
		}
		const { queue } = session;
		const update = () => setView({ scope, state: { kind: "ready", snapshot: session.snapshot() } });
		const unsubscribe = queue.subscribe(update);
		const release =
			options.active && committedQueue.current !== queue
				? session.attach({
						readOnly: options.readOnly,
						canDispatch: () => latest.current.active && latest.current.canDispatch(),
						save: (request) => latest.current.save(request),
					})
				: () => {};
		if (!options.active || committedQueue.current === queue) queue.suspend();
		const entry = {
			scope,
			queue,
			release,
			requiresFreshFrame: committedQueue.current === queue,
			timer: undefined as ReturnType<typeof setTimeout> | undefined,
		};
		current.current = entry;
		update();
		if (options.active && !options.readOnly) entry.timer = setTimeout(() => void queue.flush(), 600);
		return () => {
			clearTimeout(entry.timer);
			unsubscribe();
			release();
			if (current.current === entry) current.current = null;
		};
	}, [scope, options.storage, options.active, options.readOnly]);
	const entry = useCallback(() => {
		const value = current.current;
		return value?.scope === scope ? value : null;
	}, [scope]);
	const draftChanged = useCallback(
		(content: DraftContent) => {
			const value = entry();
			if (value === null || !latest.current.active || latest.current.readOnly || !latest.current.canDispatch()) return;
			const snapshot = value.queue.snapshot();
			if (snapshot.suspended || snapshot.closed || snapshot.explicitEdit || value.requiresFreshFrame) return;
			value.queue.edit(content);
			clearTimeout(value.timer);
			value.timer = setTimeout(() => void value.queue.flush(), 600);
		},
		[entry],
	);
	const suspend = useCallback(() => {
		const value = entry();
		if (value === null) return;
		clearTimeout(value.timer);
		value.queue.suspend();
	}, [entry]);
	const saveNow = useCallback(() => {
		const value = entry();
		if (value === null) return Promise.resolve();
		clearTimeout(value.timer);
		return value.queue.flush();
	}, [entry]);
	const beginExplicitEdit = useCallback(
		async (frame: DocumentEditorFrame | null) => {
			const value = entry();
			const assertAccess = () => {
				if (
					value === null ||
					entry() !== value ||
					value.requiresFreshFrame ||
					!latest.current.active ||
					latest.current.readOnly ||
					!latest.current.canDispatch()
				)
					throw new Error("Open a current editor session before an explicit edit.");
			};
			assertAccess();
			if (value === null) throw new Error("The draft is unavailable.");
			if (!value.queue.snapshot().explicitEdit) {
				if (value.queue.snapshot().suspended) throw new Error("Resume the editor before another explicit edit.");
				if (frame === null) throw new Error("The editor must acknowledge its final draft first.");
				await frame.suspendEditing();
				assertAccess();
			}
			clearTimeout(value.timer);
			const lease = await value.queue.beginExplicitEdit(latest.current.document);
			assertAccess();
			return {
				...lease,
				dispatch: (...args: Parameters<typeof lease.dispatch>) => {
					assertAccess();
					return lease.dispatch(...args);
				},
				replay: (...args: Parameters<typeof lease.replay>) => {
					assertAccess();
					return lease.replay(...args);
				},
				acceptCommittedDocument: (...args: Parameters<typeof lease.acceptCommittedDocument>) => {
					lease.acceptCommittedDocument(...args);
					value.requiresFreshFrame = true;
					committedQueue.current = value.queue;
					if (entry() === value) setView({ scope, state: { kind: "ready", snapshot: value.queue.snapshot() } });
				},
			};
		},
		[entry, scope],
	);
	const resumeEditing = useCallback(
		(frame: DocumentEditorFrame) => {
			const value = entry();
			if (
				value === null ||
				value.requiresFreshFrame ||
				!latest.current.active ||
				latest.current.readOnly ||
				!latest.current.canDispatch() ||
				value.queue.snapshot().explicitEdit
			)
				return false;
			if (!frame.resumeEditing()) return false;
			value.queue.resume();
			clearTimeout(value.timer);
			value.timer = setTimeout(() => void value.queue.flush(), 600);
			return true;
		},
		[entry],
	);
	const retry = useCallback(() => entry()?.queue.retry() ?? Promise.resolve(), [entry]);
	const exportDraft = useCallback(() => {
		const value = entry();
		return value === null ? null : JSON.stringify(value.queue.snapshot().draft);
	}, [entry]);
	const discard = useCallback(
		(expectedBytes: string) => {
			const value = entry();
			if (value === null) return;
			if (JSON.stringify(value.queue.snapshot().draft) !== expectedBytes)
				throw new Error("The draft changed. Confirm its current bytes before discard.");
			clearTimeout(value.timer);
			value.queue.discard();
		},
		[entry],
	);
	return {
		state: view.scope === scope ? view.state : ({ kind: "loading" } as DocumentAutosaveState),
		draftChanged,
		beginExplicitEdit,
		resumeEditing,
		requiresFreshFrame: entry()?.requiresFreshFrame ?? false,
		suspend,
		saveNow,
		retry,
		exportDraft,
		discard,
	};
}
