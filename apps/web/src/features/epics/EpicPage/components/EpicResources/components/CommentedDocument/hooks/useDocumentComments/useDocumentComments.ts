import { useQuery } from "@tanstack/react-query";
import type { ResourceCommentThread } from "@trellis/api";
import { useEffect, useSyncExternalStore } from "react";
import { useApp } from "../../../../../../../../../lib/appContext";
import type {
	CommentsState,
	EditorHandle,
	MovedAnchor,
} from "../../../../../../../../ticket/Description/components/LazyEditor";

const noThreads: readonly ResourceCommentThread[] = [];
const noSubscription = () => () => {};
const noSnapshot = () => null;

export type DocumentComments = {
	resourceId: string;
	threads: readonly ResourceCommentThread[];
	// The comment state of the editor, or null before the editor is ready.
	editor: CommentsState | null;
	loadError: Error | null;
	// The text of the comment being written, or null.
	draftQuote: string | null;
	startDraft: () => boolean;
	cancelDraft: () => void;
	sendDraft: (body: string) => Promise<void>;
	open: (id: string) => void;
	reveal: (id: string) => void;
	reply: (thread: string, body: string) => Promise<void>;
	resolve: (thread: string, resolved: boolean) => Promise<void>;
	edit: (id: string, body: string) => Promise<void>;
	remove: (id: string) => Promise<void>;
	saveAnchors: (moved: MovedAnchor[]) => Promise<void>;
};

// The comment threads of one document resource, joined to the editor that
// shows it. The server holds the threads, and the editor holds where the
// text of each thread sits now. A save of the document body also stores the
// anchors that the edit moved, so a thread follows its text.
export function useDocumentComments(resourceId: string, handle: EditorHandle | null): DocumentComments {
	const { client, orpc, queryClient } = useApp();
	const list = useQuery(orpc.resourceComments.list.queryOptions({ input: { resource: resourceId } }));
	const threads = list.data ?? noThreads;
	const comments = handle?.comments ?? null;
	const editor = useSyncExternalStore(comments?.subscribe ?? noSubscription, comments?.snapshot ?? noSnapshot);
	const refetch = () => queryClient.invalidateQueries({ queryKey: orpc.resourceComments.key() });
	const saveAnchors = async (moved: MovedAnchor[]) => {
		if (moved.length === 0) return;
		await client.resourceComments.anchors({ resource: resourceId, anchors: moved });
		await refetch();
	};

	// A thread whose text an edit outside this editor removed is stored as
	// removed once the editor has looked for its text.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `saveAnchors` changes on every render
	useEffect(() => {
		if (comments === null || list.data === undefined) return;
		comments.setThreads(
			list.data.map((thread) => ({
				id: thread.id,
				anchor: thread.anchor,
				textRemoved: thread.textRemoved,
				resolved: thread.resolved !== null,
			})),
		);
		void saveAnchors(comments.takeMoved());
	}, [comments, list.data]);

	return {
		resourceId,
		threads,
		editor,
		loadError: list.error,
		draftQuote: editor === null || editor.draft === null ? null : (comments!.draftAnchor()?.quote ?? null),
		startDraft: () => comments!.startDraft(),
		cancelDraft: () => comments!.cancelDraft(),
		sendDraft: async (body) => {
			const anchor = comments!.draftAnchor()!;
			const thread = await client.resourceComments.create({ resource: resourceId, anchor, body });
			comments!.adoptDraft(thread.id, anchor);
			await refetch();
		},
		open: (id) => comments!.setActive(id),
		reveal: (id) => {
			comments!.setActive(id);
			comments!.reveal(id);
		},
		reply: async (thread, body) => {
			await client.resourceComments.reply({ thread, body });
			await refetch();
		},
		resolve: async (thread, resolved) => {
			await client.resourceComments.resolve({ thread, resolved });
			await refetch();
		},
		edit: async (id, body) => {
			await client.resourceComments.edit({ id, body });
			await refetch();
		},
		remove: async (id) => {
			await client.resourceComments.remove({ id });
			await refetch();
		},
		saveAnchors,
	};
}
