import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ResourceCommentAnchor } from "@trellis/api";
import { editorHost } from "../../../editorHost";
import { anchorOf, docText, findAnchor, type Range } from "./anchorText";

// One comment thread that the editor tracks. `range` is where the commented
// text sits now, and null when an edit deleted it. `stored` is the anchor the
// server holds, so a save sends only the anchors that an edit changed.
export type TrackedThread = {
	range: Range | null;
	stored: { anchor: ResourceCommentAnchor; textRemoved: boolean };
	resolved: boolean;
};

// The comment state of the editor. The editor draws the highlights as
// decorations, which live in the view only, so the markdown that the editor
// writes holds no trace of a comment. `draft` is the text of a comment the
// person is writing, and `active` is the thread the person opened.
export type CommentsState = {
	threads: ReadonlyMap<string, TrackedThread>;
	draft: Range | null;
	active: string | null;
	decorations: DecorationSet;
};

export type ThreadInput = {
	id: string;
	anchor: ResourceCommentAnchor;
	textRemoved: boolean;
	resolved: boolean;
};

export type MovedAnchor = { thread: string; anchor: ResourceCommentAnchor; textRemoved: boolean };

type Action =
	| { type: "set"; threads: ThreadInput[] }
	| { type: "reset" }
	| { type: "draft"; range: Range | null }
	| { type: "adopt"; id: string; anchor: ResourceCommentAnchor }
	| { type: "active"; id: string | null }
	| { type: "stored"; moved: MovedAnchor[] };

const key = new PluginKey<CommentsState>("commentAnchors");

const empty: CommentsState = { threads: new Map(), draft: null, active: null, decorations: DecorationSet.empty };

// Text typed at either edge of a range stays outside it. A range whose text
// is all gone maps to null.
const mapRange = (range: Range, tr: Transaction): Range | null => {
	const from = tr.mapping.map(range.from, 1);
	const to = tr.mapping.map(range.to, -1);
	return from < to ? { from, to } : null;
};

const decorate = (doc: Node, state: Omit<CommentsState, "decorations">) => {
	const marks: Decoration[] = [];
	for (const [id, thread] of state.threads) {
		if (thread.range === null || thread.resolved) continue;
		const className = id === state.active ? "comment-anchor comment-anchor-active" : "comment-anchor";
		marks.push(Decoration.inline(thread.range.from, thread.range.to, { class: className, "data-thread": id }));
	}
	if (state.draft !== null)
		marks.push(Decoration.inline(state.draft.from, state.draft.to, { class: "comment-anchor comment-anchor-active" }));
	return DecorationSet.create(doc, marks);
};

const setThreads = (doc: Node, current: ReadonlyMap<string, TrackedThread>, inputs: ThreadInput[]) => {
	let text: ReturnType<typeof docText> | null = null;
	const threads = new Map<string, TrackedThread>();
	for (const input of inputs) {
		const stored = { anchor: input.anchor, textRemoved: input.textRemoved };
		const known = current.get(input.id);
		if (known !== undefined) {
			threads.set(input.id, { range: known.range, stored, resolved: input.resolved });
			continue;
		}
		text ??= docText(doc);
		const range = input.textRemoved ? null : findAnchor(text, input.anchor, false);
		threads.set(input.id, { range, stored, resolved: input.resolved });
	}
	return threads;
};

// An undo that puts deleted text back puts its thread back too, when the
// whole anchor with its context stands in the document again.
const reattach = (doc: Node, threads: Map<string, TrackedThread>) => {
	const removed = [...threads].filter(([, thread]) => thread.range === null);
	if (removed.length === 0) return;
	const text = docText(doc);
	for (const [id, thread] of removed) {
		const range = findAnchor(text, thread.stored.anchor, true);
		if (range !== null) threads.set(id, { ...thread, range });
	}
};

const apply = (tr: Transaction, previous: CommentsState, state: EditorState): CommentsState => {
	const action = tr.getMeta(key) as Action | undefined;
	if (!tr.docChanged && action === undefined) return previous;
	if (action?.type === "reset") return empty;
	let threads = new Map(previous.threads);
	let draft = previous.draft;
	let active = previous.active;
	if (tr.docChanged) {
		for (const [id, thread] of threads)
			if (thread.range !== null) threads.set(id, { ...thread, range: mapRange(thread.range, tr) });
		draft = draft === null ? null : mapRange(draft, tr);
		reattach(state.doc, threads);
	}
	switch (action?.type) {
		case "set":
			threads = setThreads(state.doc, threads, action.threads);
			break;
		case "draft":
			draft = action.range;
			break;
		case "adopt":
			threads.set(action.id, { range: draft, stored: { anchor: action.anchor, textRemoved: false }, resolved: false });
			draft = null;
			active = action.id;
			break;
		case "active":
			active = action.id;
			break;
		case "stored":
			for (const moved of action.moved) {
				const thread = threads.get(moved.thread)!;
				threads.set(moved.thread, { ...thread, stored: { anchor: moved.anchor, textRemoved: moved.textRemoved } });
			}
			break;
	}
	const next = { threads, draft, active };
	return { ...next, decorations: decorate(state.doc, next) };
};

// The smallest open thread whose text holds `pos`.
const threadAt = (state: CommentsState, pos: number) => {
	let found: { id: string; size: number } | null = null;
	for (const [id, thread] of state.threads) {
		if (thread.range === null || thread.resolved) continue;
		if (pos < thread.range.from || pos > thread.range.to) continue;
		const size = thread.range.to - thread.range.from;
		if (found === null || size < found.size) found = { id, size };
	}
	return found?.id ?? null;
};

export const commentsOf = (state: EditorState): CommentsState => key.getState(state)!;

export const commentAction = (tr: Transaction, action: Action) => tr.setMeta(key, action);

// The anchors that edits changed since the server last stored them.
export const movedAnchors = (state: EditorState): MovedAnchor[] => {
	const comments = commentsOf(state);
	if (comments.threads.size === 0) return [];
	const text = docText(state.doc);
	const moved: MovedAnchor[] = [];
	for (const [id, thread] of comments.threads) {
		const now = thread.range === null ? null : anchorOf(text, thread.range);
		const anchor = now ?? thread.stored.anchor;
		const textRemoved = now === null;
		const { stored } = thread;
		if (
			stored.textRemoved === textRemoved &&
			stored.anchor.quote === anchor.quote &&
			stored.anchor.prefix === anchor.prefix &&
			stored.anchor.suffix === anchor.suffix
		)
			continue;
		moved.push({ thread: id, anchor, textRemoved });
	}
	return moved;
};

// A click on commented text opens its thread, and the caret still lands
// where the person clicked.
export const CommentAnchors = Extension.create({
	name: "commentAnchors",
	addProseMirrorPlugins() {
		return [
			new Plugin<CommentsState>({
				key,
				state: { init: () => empty, apply: (tr, previous, _old, state) => apply(tr, previous, state) },
				props: {
					decorations: (state) => commentsOf(state).decorations,
					handleClick: (view, pos) => {
						const id = threadAt(commentsOf(view.state), pos);
						const open = editorHost.get().openThread;
						if (id !== null && open !== null) open(id);
						return false;
					},
				},
			}),
		];
	},
});
