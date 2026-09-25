import { ChatText } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import type { PageCommentAnchor } from "@trellis/api";
import { ConfirmDialog, IconButton, Sheet, Tooltip, useMediaQuery } from "@trellis/ui";
import { ReviewCommentEditor } from "@trellis/ui/review";
import { useMemo, useRef, useState } from "react";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";
import { errorMessage } from "../../../lib/conflict";
import { LeasedPageViewer } from "../PageDetail/components/LeasedPageViewer";
import { numberPageComments, pageCommentPins, pageCommentSearch } from "./commentRows";
import { PageCommentThreads } from "./PageCommentThreads";
import { usePageComments } from "./usePageComments";

const WIDE_QUERY = "(min-width: 80rem)";

const anchorLabel = (anchor: PageCommentAnchor) =>
	anchor.kind === "text" ? `Selected text: “${anchor.quote}”` : `Element: ${anchor.path}`;

export function PageComments({
	page,
	version,
	latestVersion,
	title,
	historical,
	blocked,
}: {
	page: string;
	version: number;
	latestVersion: number;
	title: string;
	historical: boolean;
	blocked: boolean;
}) {
	const comments = usePageComments(page);
	const navigate = useNavigate();
	const wide = useMediaQuery(WIDE_QUERY);
	const trigger = useRef<HTMLButtonElement>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [showResolved, setShowResolved] = useState(false);
	const [selected, setSelected] = useState<string | null>(null);
	const [draft, setDraft] = useState<PageCommentAnchor | null>(null);
	const [body, setBody] = useState("");
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [warnCancel, setWarnCancel] = useState(false);
	const numbered = useMemo(() => numberPageComments(comments.threads), [comments.threads]);
	const currentPins = pageCommentPins(numbered, version, showResolved).slice(0, 500);
	const select = (id: string) => {
		const target = numbered.find(({ thread }) => thread.id === id)?.thread;
		if (target !== undefined && target.version !== version) {
			void navigate({
				to: "/p/$",
				params: { _splat: page },
				search: pageCommentSearch(target.version, latestVersion),
			});
			return;
		}
		if (target?.resolved !== null) setShowResolved(true);
		setSelected(id);
		if (!wide) setSheetOpen(true);
	};
	const openDraft = (anchor: PageCommentAnchor) => {
		if (blocked || historical) return;
		setDraft(anchor);
		setSelected(null);
		setSaveError(null);
		if (!wide) setSheetOpen(true);
	};
	const closeDraft = () => {
		setDraft(null);
		setBody("");
		setSaveError(null);
		setWarnCancel(false);
	};
	const saveDraft = async () => {
		if (draft === null) return;
		setSaving(true);
		setSaveError(null);
		try {
			const thread = await comments.create(version, draft, body.trim());
			closeDraft();
			setSelected(thread.id);
		} catch (error) {
			setSaveError(errorMessage(error));
		} finally {
			setSaving(false);
		}
	};
	const threadList = (
		<div className="flex flex-col gap-3 px-3 py-3">
			{draft !== null && (
				<ReviewCommentEditor
					body={body}
					onChange={setBody}
					onSave={() => void saveDraft()}
					onCancel={closeDraft}
					onEscape={() => (body.trim() === "" ? closeDraft() : setWarnCancel(true))}
					renderPreview={(markdown) => <ReadOnlyMarkdown markdown={markdown} className="text-sm" />}
					saveLabel="Comment"
					location={anchorLabel(draft)}
					pending={saving}
					error={saveError}
					submitOnEnter
				/>
			)}
			<PageCommentThreads
				threads={numbered}
				selected={selected}
				showResolved={showResolved}
				readOnly={blocked || historical}
				loading={comments.pending}
				loadError={comments.error}
				actions={comments}
				onSelect={select}
				onShowResolved={setShowResolved}
			/>
		</div>
	);
	return (
		<>
			<div role="status" aria-live="polite" className="sr-only">
				{comments.status}
			</div>
			<div className="relative flex min-h-0 min-w-0 flex-1">
				<LeasedPageViewer
					page={page}
					version={version}
					title={title}
					comments={currentPins}
					selectedThread={selected}
					onCommentAnchor={openDraft}
					onOpenThread={select}
				/>
				{wide ? (
					<aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border">{threadList}</aside>
				) : (
					<>
						<div className="absolute right-3 top-3 z-20">
							<Tooltip content="Comments">
								<IconButton ref={trigger} label="Comments" icon={<ChatText />} onClick={() => setSheetOpen(true)} />
							</Tooltip>
						</div>
						<Sheet
							open={sheetOpen}
							onOpenChange={(open) => {
								if (!open && draft !== null && body.trim() !== "") {
									setWarnCancel(true);
									return;
								}
								setSheetOpen(open);
								if (!open && draft !== null) closeDraft();
							}}
							title="Comments"
							titleClassName="text-md font-medium"
							modal={false}
							width={360}
							finalFocus={trigger}
						>
							{threadList}
						</Sheet>
					</>
				)}
			</div>
			<ConfirmDialog
				open={warnCancel}
				title="Discard this comment?"
				description="The comment draft has text that Trellis has not saved."
				confirmLabel="Discard"
				danger
				onCancel={() => setWarnCancel(false)}
				onConfirm={closeDraft}
			/>
		</>
	);
}
