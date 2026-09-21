import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ReadOnlyMarkdown } from "../../../../../../../components/ReadOnlyMarkdown";
import { type EditorHandle, LazyEditor } from "../../../../../../ticket/Description/components/LazyEditor";
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
};

// The pause after the last keystroke before a save.
const SAVE_DELAY_MS = 600;

// One document of the Resources tab, edited in place: a title that renames it
// and a body in the shared ticket editor. Both save as the person types, and
// at once on blur and when another document opens. The caller gives this
// component a React key of `docId`, so each document starts with its own
// savers.
export function EpicDocument({ docId, markdown, title, readOnly, saveBody }: EpicDocumentProps) {
	const [name, setName] = useState(title?.name ?? "");
	const [fileError, setFileError] = useState<string | null>(null);
	const editor = useRef<EditorHandle | null>(null);
	// `scope` runs the saves of one document in order, so an older text never
	// lands after a newer one.
	const body = useMutation({ mutationFn: saveBody, scope: { id: `doc-body:${docId}` } });
	const rename = useMutation({ mutationFn: (next: string) => title!.save(next), scope: { id: `doc-name:${docId}` } });
	const [bodySaver] = useState(() => typingSaver((text) => body.mutate(text), markdown, SAVE_DELAY_MS));
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
			<article className="flex flex-col gap-4">
				{title !== null && <h2 className="text-2xl font-semibold text-fg">{name === "" ? UNTITLED : name}</h2>}
				<ReadOnlyMarkdown markdown={markdown} className="text-md" />
			</article>
		);
	}
	return (
		<article className="flex flex-col gap-4">
			{title !== null && (
				<input
					aria-label="Title"
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
			)}
			<LazyEditor
				markdown={markdown}
				contentKey={docId}
				onChange={(next) => {
					setFileError(null);
					bodySaver.change(next);
				}}
				onBlur={bodySaver.flush}
				onReady={(handle) => {
					editor.current = handle;
				}}
				onAttachFiles={() => {
					setFileError("This document accepts text only. Add the file as another resource.");
				}}
			/>
			{fileError !== null && (
				<p role="alert" className="text-sm text-danger">
					{fileError}
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
		</article>
	);
}
