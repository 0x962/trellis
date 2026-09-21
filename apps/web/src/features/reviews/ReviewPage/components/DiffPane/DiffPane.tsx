import { useMutation } from "@tanstack/react-query";
import type { PrChangeType, ReviewRevision, ReviewThread } from "@trellis/api";
import { type DiffAnchor, ReviewDiff } from "@trellis/ui/review";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useTheme } from "../../../../../lib/theme";
import type { ReadMarkFile } from "../../../FileRiskGroups/readMarks/readMarks";
import { type ReviewCommentInput, ReviewComposer } from "../../../ReviewComposer/ReviewComposer";
import { DiffToolbar } from "../DiffToolbar";

export type DiffPaneProps = {
	pr: string;
	revision: ReviewRevision;
	// The threads that belong to the revision on screen.
	threads: ReviewThread[];
	// The diff list scrolls to this path.
	selectedFile: string;
	renderThread: (id: string) => ReactNode;
	// The changed files of the revision, as the patch reports them. The page
	// gives them to `FileRiskGroups`.
	onFiles: (files: ReadMarkFile[]) => void;
};

const commentKey = (pr: string, anchor: DiffAnchor) =>
	`trellis.review.comment:${pr}:${anchor.path}:${anchor.side}:${anchor.startLine}:${anchor.line}`;

// The diff of the revision, with the comment composer that a line selection
// opens. `ReviewDiff` renders only the rows inside the visible height, so
// `.review-diff-window` gives it a fixed height and its own scroll bar.
export function DiffPane({ pr, revision, threads, selectedFile, renderThread, onFiles }: DiffPaneProps) {
	const { client, orpc, queryClient } = useApp();
	const { resolved: theme } = useTheme();
	const [mode, setMode] = useState<"split" | "unified">(() =>
		localStorage.getItem("trellis.review.mode") === "split" ? "split" : "unified",
	);
	// The composer sits on an anchor; `lines` is the text of the selected
	// lines, which a suggestion block starts from.
	const [composer, setComposerState] = useState<{ anchor: DiffAnchor; lines: string[] | null } | null>(null);
	const composerRevision = useRef(revision.id);
	useEffect(() => {
		if (composerRevision.current === revision.id) return;
		composerRevision.current = revision.id;
		setComposerState(null);
	}, [revision.id]);
	const addThread = useMutation({
		mutationFn: (comment: ReviewCommentInput) => client.reviews.add({ pr, ...comment }),
		onSuccess: () => {
			if (composer) localStorage.removeItem(commentKey(pr, composer.anchor));
			setComposerState(null);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
		},
	});
	const loadFile = useCallback(
		async (path: string, side: "old" | "new") => {
			const result = await client.reviews.file({ pr, revisionId: revision.id, path, side });
			return result.content;
		},
		[client, pr, revision.id],
	);
	// `ReviewDiff` reports the file list from an effect that watches this
	// callback, so a new callback on every render would report the list on
	// every render.
	const reportFiles = useCallback(
		(files: { path: string; type: string; additions: number; deletions: number }[]) =>
			onFiles(
				files.map((file) => ({
					path: file.path,
					change: file.type as PrChangeType,
					additions: file.additions,
					deletions: file.deletions,
				})),
			),
		[onFiles],
	);
	return (
		<div className="review-diff-window">
			<DiffToolbar
				mode={mode}
				onMode={(value) => {
					setMode(value);
					localStorage.setItem("trellis.review.mode", value);
				}}
			/>
			<ReviewDiff
				patch={revision.patch}
				loadFile={loadFile}
				revisionId={revision.id}
				threads={threads}
				mode={mode}
				theme={theme}
				selectedFile={selectedFile}
				renderThread={renderThread}
				composer={composer?.anchor ?? null}
				renderComposer={() =>
					composer && (
						<ReviewComposer
							key={`${revision.id}:${composer.anchor.path}:${composer.anchor.side}:${composer.anchor.startLine}:${composer.anchor.line}`}
							anchor={composer.anchor}
							lines={composer.lines}
							revisionId={revision.id}
							storageKey={commentKey(pr, composer.anchor)}
							onClose={() => {
								addThread.reset();
								setComposerState(null);
							}}
							onSave={(comment) => addThread.mutate(comment)}
							pending={addThread.isPending}
							error={addThread.error?.message ?? null}
						/>
					)
				}
				onSelect={(anchor, lines) => {
					addThread.reset();
					setComposerState({ anchor, lines });
				}}
				onFiles={reportFiles}
			/>
		</div>
	);
}
