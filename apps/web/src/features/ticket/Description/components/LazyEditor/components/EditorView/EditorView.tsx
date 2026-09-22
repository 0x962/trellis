import { Editor, EditorContent } from "@tiptap/react";
import type { ResourceCommentAnchor } from "@trellis/api";
import { useEffect, useRef } from "react";
import "./editor.css";
import { editorHost } from "../../editorHost";
import { SlashMenuList, useSlashMenuStore } from "../SlashMenu";
import {
	type CommentsState,
	commentAction,
	commentsOf,
	type MovedAnchor,
	movedAnchors,
	type ThreadInput,
} from "./commentAnchors";
import { anchorOf, docText } from "./commentAnchors/anchorText";
import { BlockHandle } from "./components/BlockHandle";
import { FormatMenu } from "./components/FormatMenu";
import { editorExtensions } from "./editorExtensions";

export type { CommentsState, MovedAnchor, ThreadInput } from "./commentAnchors";

// The comment threads of the open document, as the editor tracks them.
export type CommentsHandle = {
	// The threads of the document. A thread the editor tracks already keeps
	// the place its text moved to; a new one is found by its anchor text.
	setThreads: (threads: ThreadInput[]) => void;
	// Marks the selected text as the text of a new comment. False when the
	// selection holds no text.
	startDraft: () => boolean;
	cancelDraft: () => void;
	// The anchor of the new comment, read when the person sends it.
	draftAnchor: () => ResourceCommentAnchor | null;
	// Turns the draft into the thread that the server created for it.
	adoptDraft: (id: string, anchor: ResourceCommentAnchor) => void;
	setActive: (id: string | null) => void;
	// Scrolls the text of a thread into view.
	reveal: (id: string) => void;
	// The anchors that edits moved since the last call. The editor counts
	// them as stored from then on.
	takeMoved: () => MovedAnchor[];
	subscribe: (listener: () => void) => () => void;
	snapshot: () => CommentsState;
};

export type EditorHandle = {
	setContent: (markdown: string) => void;
	focus: () => void;
	// Puts an image block at the caret.
	insertImage: (src: string, alt: string) => void;
	// Puts `text` at the caret as a link to `href`.
	insertLink: (href: string, text: string) => void;
	comments: CommentsHandle;
};

export type EditorViewProps = {
	markdown: string;
	// Changes when another ticket opens. The editor takes that ticket's text.
	contentKey: string;
	onChange: (markdown: string) => void;
	onBlur: () => void;
	onReady: (handle: EditorHandle) => void;
	// Takes the files a person pastes, drops, or picks through the Image
	// block of the slash menu.
	onAttachFiles: (files: File[]) => void;
	// The words the empty editor shows.
	placeholder: string;
	// False leaves the focus where it is when the editor opens, such as in
	// the title field of a new document.
	autoFocus: boolean;
	// Given on a document that takes comments. `onComment` runs from the
	// Comment button of the format menu, and `onOpenThread` on a click on
	// commented text.
	comments?: { onComment: () => void; onOpenThread: (id: string) => void };
};

let shared: Editor | null = null;

// One Tiptap instance serves every ticket. A second open sets its content;
// it never builds a second editor. The chunk registry destroys it when the
// last description leaves the screen.
const getEditor = () => {
	if (shared === null) {
		shared = new Editor({
			extensions: editorExtensions(),
			contentType: "markdown",
			content: "",
			editorProps: {
				// ProseMirror prevents every Escape after its key handlers run.
				// Handle focus here and let an open slash menu consume the first press.
				handleKeyDown: (view, event) => {
					if (event.key !== "Escape") return false;
					event.stopPropagation();
					if (event.repeat || event.isComposing) return true;
					if (useSlashMenuStore.getState().open) return false;
					view.dom.blur();
					return true;
				},
				attributes: {
					role: "textbox",
					"aria-label": "Description",
					"aria-multiline": "true",
					class: "markdown editor min-h-24 outline-none",
				},
			},
		});
	}
	return shared;
};

// The editors alive now: one after the first open, else none.
export const instances = () => (shared === null ? 0 : 1);

export const destroyEditor = () => {
	shared?.destroy();
	shared = null;
};

const dispatch = (editor: Editor, action: Parameters<typeof commentAction>[1]) =>
	editor.view.dispatch(commentAction(editor.state.tr, action));

const commentsHandleOf = (editor: Editor): CommentsHandle => ({
	setThreads: (threads) => dispatch(editor, { type: "set", threads }),
	startDraft: () => {
		const { from, to } = editor.state.selection;
		if (anchorOf(docText(editor.state.doc), { from, to }) === null) return false;
		dispatch(editor, { type: "draft", range: { from, to } });
		return true;
	},
	cancelDraft: () => dispatch(editor, { type: "draft", range: null }),
	draftAnchor: () => {
		const { draft } = commentsOf(editor.state);
		return draft === null ? null : anchorOf(docText(editor.state.doc), draft);
	},
	adoptDraft: (id, anchor) => dispatch(editor, { type: "adopt", id, anchor }),
	setActive: (id) => dispatch(editor, { type: "active", id }),
	reveal: (id) => {
		const range = commentsOf(editor.state).threads.get(id)?.range ?? null;
		if (range === null) return;
		const { node } = editor.view.domAtPos(range.from);
		const element = node instanceof Element ? node : node.parentElement!;
		element.scrollIntoView({ block: "center" });
	},
	takeMoved: () => {
		const moved = movedAnchors(editor.state);
		if (moved.length > 0) dispatch(editor, { type: "stored", moved });
		return moved;
	},
	subscribe: (listener) => {
		editor.on("transaction", listener);
		return () => {
			editor.off("transaction", listener);
		};
	},
	snapshot: () => commentsOf(editor.state),
});

const handleOf = (editor: Editor): EditorHandle => ({
	// The comment state belongs to one document, so a new text clears it.
	setContent: (markdown) => {
		editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
		dispatch(editor, { type: "reset" });
	},
	focus: () => editor.commands.focus("end"),
	insertImage: (src, alt) => editor.chain().focus().setImage({ src, alt }).run(),
	insertLink: (href, text) =>
		editor
			.chain()
			.focus()
			.insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href } }] })
			.run(),
	comments: commentsHandleOf(editor),
});

// The shared editor mounted on one description. It takes the ticket's
// markdown, focuses, and reports every change as markdown.
export function EditorView({
	markdown,
	contentKey,
	onChange,
	onBlur,
	onReady,
	onAttachFiles,
	placeholder,
	autoFocus,
	comments,
}: EditorViewProps) {
	const picker = useRef<HTMLInputElement>(null);
	// The host is written before `getEditor`, because the editor draws its
	// placeholder from it on the first mount.
	editorHost.set({
		placeholder,
		attachFiles: onAttachFiles,
		pickFiles: () => picker.current!.click(),
		openThread: comments?.onOpenThread ?? null,
	});
	const editor = getEditor();

	// biome-ignore lint/correctness/useExhaustiveDependencies: the content loads once per ticket
	useEffect(() => {
		const handle = handleOf(editor);
		handle.setContent(markdown);
		if (autoFocus) handle.focus();
		onReady(handle);
	}, [contentKey, editor]);

	useEffect(() => {
		const update = () => onChange(editor.getMarkdown());
		editor.on("update", update);
		editor.on("blur", onBlur);
		return () => {
			editor.off("update", update);
			editor.off("blur", onBlur);
		};
	}, [editor, onChange, onBlur]);

	return (
		<div className="relative">
			<EditorContent editor={editor} />
			<BlockHandle editor={editor} />
			<FormatMenu editor={editor} onComment={comments?.onComment} />
			<SlashMenuList />
			<input
				ref={picker}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
				multiple
				hidden
				onChange={(event) => {
					const files = [...event.target.files!];
					event.target.value = "";
					if (files.length > 0) onAttachFiles(files);
				}}
			/>
		</div>
	);
}
