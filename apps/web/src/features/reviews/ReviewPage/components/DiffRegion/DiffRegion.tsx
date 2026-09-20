import { useMutation } from "@tanstack/react-query";
import type { PrChangeType, ReviewRevision, ReviewThread } from "@trellis/api";
import { type DiffAnchor, ReviewDiff } from "@trellis/ui/review";
import { type ReactNode, useCallback, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useTheme } from "../../../../../lib/theme";
import { type ReviewCommentInput, ReviewComposer } from "../../../ReviewComposer/ReviewComposer";
import { DiffToolbar } from "../DiffToolbar/DiffToolbar";

// One changed file of the revision on screen, in the shape the file list of
// region G reads.
export type DiffFile = { path: string; change: PrChangeType; additions: number; deletions: number };

export type DiffRegionProps = {
	pr: string;
	revision: ReviewRevision;
	// The threads that belong to the revision on screen.
	threads: ReviewThread[];
	// The path whose diff the reader asked for. The list scrolls to it.
	selectedFile: string;
	renderThread: (id: string) => ReactNode;
	// The changed files of the revision, as the patch reports them. The page
	// gives them to the file list of region G.
	onFiles: (files: DiffFile[]) => void;
	// True while a comment composer holds unsent text. The page disables the
	// refresh button then, because a refresh replaces the revision the
	// composer writes against.
	onComposer: (open: boolean) => void;
};

const commentKey = (pr: string, anchor: DiffAnchor) =>
	`trellis.review.comment:${pr}:${anchor.path}:${anchor.side}:${anchor.startLine}:${anchor.line}`;

// The diff of the revision, with the comment composer that a line selection
// opens. It scrolls inside its own box, because it draws only the lines that
// box shows.
export function DiffRegion({
	pr,
	revision,
	threads,
	selectedFile,
	renderThread,
	onFiles,
	onComposer,
}: DiffRegionProps) {
	const { client, orpc, queryClient } = useApp();
	const { resolved: theme } = useTheme();
	const [mode, setMode] = useState<"split" | "unified">(() =>
		localStorage.getItem("trellis.review.mode") === "split" ? "split" : "unified",
	);
	// The composer sits on an anchor; `lines` is the text of the selected
	// lines, which a suggestion block starts from.
	const [composer, setComposerState] = useState<{ anchor: DiffAnchor; lines: string[] | null } | null>(null);
	const setComposer = (next: { anchor: DiffAnchor; lines: string[] | null } | null) => {
		setComposerState(next);
		onComposer(next !== null);
	};
	const addThread = useMutation({
		mutationFn: (comment: ReviewCommentInput) => client.reviews.add({ pr, ...comment }),
		onSuccess: () => {
			if (composer) localStorage.removeItem(commentKey(pr, composer.anchor));
			setComposer(null);
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
								setComposer(null);
							}}
							onSave={(comment) => addThread.mutate(comment)}
							pending={addThread.isPending}
							error={addThread.error?.message ?? null}
						/>
					)
				}
				onSelect={(anchor, lines) => {
					addThread.reset();
					setComposer({ anchor, lines });
				}}
				onFiles={reportFiles}
			/>
		</div>
	);
}
