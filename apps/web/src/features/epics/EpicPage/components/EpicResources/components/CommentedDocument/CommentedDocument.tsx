import { ChatText } from "@phosphor-icons/react";
import { IconButton, Sheet, Tooltip, useMediaQuery } from "@trellis/ui";
import { useState } from "react";
import type { EditorHandle } from "../../../../../../ticket/Description/components/LazyEditor";
import { EpicDocument, type EpicDocumentProps } from "../EpicDocument";
import { DocumentComments } from "./components/DocumentComments";
import { useDocumentComments } from "./hooks/useDocumentComments";

// The width from which the comments margin fits beside the document. Below
// it, the threads open in a sheet.
const WIDE_QUERY = "(min-width: 80rem)";

// A document resource with its comment threads, as in Notion: select text,
// press Comment, and the thread opens beside the document. A click on
// commented text opens its thread.
export function CommentedDocument({
	resourceId,
	...props
}: Omit<EpicDocumentProps, "comments" | "onEditor"> & { resourceId: string }) {
	const [handle, setHandle] = useState<EditorHandle | null>(null);
	const comments = useDocumentComments(resourceId, handle);
	const wide = useMediaQuery(WIDE_QUERY);
	const [sheetOpen, setSheetOpen] = useState(false);
	const margin = <DocumentComments comments={comments} />;
	const hasMargin = comments.threads.length > 0 || comments.draftQuote !== null;
	return (
		<EpicDocument
			{...props}
			onEditor={setHandle}
			comments={{
				onComment: () => {
					if (comments.startDraft()) setSheetOpen(true);
				},
				onOpenThread: (id) => {
					comments.open(id);
					setSheetOpen(true);
				},
				saveAnchors: comments.saveAnchors,
				margin: wide ? (
					hasMargin && (
						<aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border px-3 py-3">
							{margin}
						</aside>
					)
				) : (
					<Sheet
						open={sheetOpen}
						onOpenChange={(open) => {
							setSheetOpen(open);
							if (!open) comments.cancelDraft();
						}}
						title="Comments"
						modal={false}
						width={360}
					>
						<div className="px-3 py-3">{margin}</div>
					</Sheet>
				),
				titleAction: !wide && comments.threads.length > 0 && (
					<Tooltip content="Comments">
						<IconButton label="Comments" icon={<ChatText />} onClick={() => setSheetOpen(true)} />
					</Tooltip>
				),
			}}
		/>
	);
}
