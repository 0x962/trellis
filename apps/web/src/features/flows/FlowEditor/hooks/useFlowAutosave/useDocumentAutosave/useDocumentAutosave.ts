import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { DraftContent } from "../../../../langflowDrafts/draftRecord";
import {
	type DocumentAccess,
	type DocumentSessionOptions,
	documentScopeKey,
	documentSession,
} from "../../../../langflowDrafts/documentSession";
import type { createSaveQueue } from "../../../../langflowDrafts/saveQueue";

type Queue = ReturnType<typeof createSaveQueue>;
type Snapshot = ReturnType<Queue["snapshot"]>;
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
		timer?: ReturnType<typeof setTimeout>;
	} | null>(null);
	const latest = useRef(options);
	useLayoutEffect(() => {
		latest.current = options;
	});
	useLayoutEffect(() => {
		let session: ReturnType<typeof documentSession>;
		try {
			session = documentSession(latest.current);
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
		const release = options.active
			? session.attach({
					readOnly: options.readOnly,
					canDispatch: () => latest.current.active && latest.current.canDispatch(),
					save: (request) => latest.current.save(request),
				})
			: () => {};
		if (!options.active) queue.suspend();
		const entry = { scope, queue, release, timer: undefined as ReturnType<typeof setTimeout> | undefined };
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
			if (snapshot.suspended || snapshot.closed) return;
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
		suspend,
		saveNow,
		retry,
		exportDraft,
		discard,
	};
}
