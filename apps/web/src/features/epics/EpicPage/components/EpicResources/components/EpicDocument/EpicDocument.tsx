import { useMutation } from "@tanstack/react-query";
import type { Resource } from "@trellis/api";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ReadOnlyMarkdown } from "../../../../../../../components/ReadOnlyMarkdown";
import { isThumbnailImage } from "../../../../../../attachments/utils/isThumbnailImage";
import {
	type EditorHandle,
	type EditorViewProps,
	LazyEditor,
	type MovedAnchor,
} from "../../../../../../ticket/Description/components/LazyEditor";
import { UNTITLED } from "../../../../../epicDocs";
import { typingSaver } from "../../typingSaver";

export type EpicDocumentProps = {
	// `PLAN_DOC_ID` or a resource id. The editor takes a new text only when
	// this id changes, so a save while the person types moves no cursor.
	docId: string;
	markdown: string;
	// Null for the epic description, whose title is its first heading.
	title: { name: string; save: (name: string) => Promise<unknown> } | null;
	readOnly: boolean;
	saveBody: (markdown: string) => Promise<unknown>;
	// Stores a file as an image or a file resource of the epic.
	uploadFile: (kind: "image" | "file", file: File) => Promise<Resource>;
	// Given for a document that takes comments. `saveAnchors` stores the
	// anchors that an edit moved, after the body that moved them. `margin`
	// draws beside the document, and `titleAction` beside the title.
	comments?: NonNullable<EditorViewProps["comments"]> & {
		saveAnchors: (moved: MovedAnchor[]) => Promise<void>;
		margin: ReactNode;
		titleAction: ReactNode;
	};
	onEditor?: (handle: EditorHandle) => void;
};

const placeholder = "Write, or press / for blocks";

// The pause after the last keystroke before a save.
const SAVE_DELAY_MS = 600;

// One document of the Resources tab, edited in place: a title that renames it
// and a body in the shared ticket editor. Both save as the person types, and
// at once on blur and when another document opens. The caller gives this
// component a React key of `docId`, so each document starts with its own
// savers. A pasted, dropped or picked file becomes a resource of the epic,
// and the document shows it at the caret: an image inline, any other file as
// a link.
export function EpicDocument({
	docId,
	markdown,
	title,
	readOnly,
	saveBody,
	uploadFile,
	comments,
	onEditor,
}: EpicDocumentProps) {
	const [name, setName] = useState(title?.name ?? "");
	const editor = useRef<EditorHandle | null>(null);
	// `scope` keeps the files of one paste in the order the person gave them.
	const upload = useMutation({
		mutationFn: (file: File) => uploadFile(isThumbnailImage(file.type) ? "image" : "file", file),
		scope: { id: `doc-upload:${docId}` },
		onSuccess: (resource) => {
			if (resource.kind === "image") editor.current!.insertImage(resource.blob!.url, resource.name);
			else editor.current!.insertLink(resource.blob!.url, resource.name);
		},
	});
	// `scope` runs the saves of one document in order, so an older text never
	// lands after a newer one. The moved anchors are read when the saver
	// fires, while the shared editor still holds this document.
	const body = useMutation({
		mutationFn: async ({ text, moved }: { text: string; moved: MovedAnchor[] }) => {
			await saveBody(text);
			await comments?.saveAnchors(moved);
		},
		scope: { id: `doc-body:${docId}` },
	});
	const rename = useMutation({ mutationFn: (next: string) => title!.save(next), scope: { id: `doc-name:${docId}` } });
	const [bodySaver] = useState(() =>
		typingSaver(
			(text) => body.mutate({ text, moved: comments === undefined ? [] : editor.current!.comments.takeMoved() }),
			markdown,
			SAVE_DELAY_MS,
		),
	);
	const [nameSaver] = useState(() => typingSaver((text) => rename.mutate(text), name, SAVE_DELAY_MS));
	useEffect(
		() => () => {
			bodySaver.flush();
			nameSaver.flush();
		},
		[bodySaver, nameSaver],
	);

	if (readOnly) {
		return (
			<DocumentColumns margin={null}>
				{title !== null && <h2 className="text-2xl font-semibold text-fg">{name === "" ? UNTITLED : name}</h2>}
				<ReadOnlyMarkdown markdown={markdown} className="text-md" />
			</DocumentColumns>
		);
	}
	return (
		<DocumentColumns margin={comments?.margin ?? null}>
			{title !== null && (
				<div className="flex items-start gap-2">
					<input
						aria-label="Title"
						// A new document starts in its title, as a new page in Notion.
						// biome-ignore lint/a11y/noAutofocus: the person just asked for this document
						autoFocus={title.name === ""}
						value={name}
						placeholder={UNTITLED}
						onChange={(event) => {
							setName(event.target.value);
							nameSaver.change(event.target.value.trim());
						}}
						onBlur={nameSaver.flush}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							nameSaver.flush();
							editor.current?.focus();
						}}
						className="w-full bg-transparent text-2xl font-semibold text-fg outline-none placeholder:text-fg-faint"
					/>
					{comments?.titleAction}
				</div>
			)}
			<LazyEditor
				markdown={markdown}
				contentKey={docId}
				onChange={bodySaver.change}
				onBlur={bodySaver.flush}
				onReady={(handle) => {
					editor.current = handle;
					onEditor?.(handle);
				}}
				onAttachFiles={(files) => {
					for (const file of files) upload.mutate(file);
				}}
				placeholder={placeholder}
				autoFocus={title === null || title.name !== ""}
				comments={
					comments === undefined ? undefined : { onComment: comments.onComment, onOpenThread: comments.onOpenThread }
				}
			/>
			{upload.isError && (
				<p role="alert" className="text-sm text-danger">
					Could not add the file. {upload.error.message}
				</p>
			)}
			{rename.isError && (
				<p role="alert" className="text-sm text-danger">
					Could not rename the document. {rename.error.message}
				</p>
			)}
			{body.isError && (
				<p role="alert" className="text-sm text-danger">
					Could not save the document. {body.error.message}
				</p>
			)}
		</DocumentColumns>
	);
}

// The scrolling document column, and the comments margin beside it when a
// document has one. The margin scrolls on its own, so a thread and the text
// it is about can both be on screen.
function DocumentColumns({ margin, children }: { margin: ReactNode; children: ReactNode }) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			<div className="min-w-0 flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<article className="mx-auto flex max-w-3xl flex-col gap-4">{children}</article>
			</div>
			{margin}
		</div>
	);
}
