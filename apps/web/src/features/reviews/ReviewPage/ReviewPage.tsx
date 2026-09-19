import { useMutation } from "@tanstack/react-query";
import type { ReviewThread } from "@trellis/api";
import { Sheet } from "@trellis/ui";
import { type DiffAnchor, ReviewDiff, ReviewFiles, ReviewTabs } from "@trellis/ui/review";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useTheme } from "../../../lib/theme";
import { ApplySuggestionsDialog, ReviewApplyContext, type ReviewApplyState, ReviewBatchBar } from "../ReviewApply";
import { checkTabStatus, type ReviewCheck } from "../ReviewChecks/checkGroups";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { type ReviewCommentInput, ReviewComposer } from "../ReviewComposer/ReviewComposer";
import { ReviewDiscussion } from "../ReviewDiscussion/ReviewDiscussion";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import { type LiveBranchMeta, liveBranchState } from "../ReviewLive/liveBranch";
import { ReviewLive } from "../ReviewLive/ReviewLive";
import { ReviewStack } from "../ReviewStack/ReviewStack";
import { ReviewSummary } from "../ReviewSummary/ReviewSummary";
import { DiffToolbar } from "./components/DiffToolbar/DiffToolbar";
import { ReviewPageSkeleton } from "./components/ReviewPageSkeleton";
import { useReviewData } from "./hooks/useReviewData";
import { useReviewNavigation } from "./hooks/useReviewNavigation";
import { checkStatusIndicator, liveStatusTone } from "./utils/reviewTabStatus";
import "@trellis/ui/review.css";

type FileRow = { path: string; type: string; additions: number; deletions: number };

const noThreads: ReviewThread[] = [];
export function ReviewPage({ pr, parent, syncHash = true }: { pr: string; parent?: ReactNode; syncHash?: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const { tab, activeThread, changeTab } = useReviewNavigation(syncHash);
	const { revision, setRevision, status, threads, refresh, refreshAll } = useReviewData(pr);
	const { resolved: theme } = useTheme();
	const [mode, setMode] = useState<"split" | "unified">(() =>
		localStorage.getItem("trellis.review.mode") === "split" ? "split" : "unified",
	);
	const [files, setFiles] = useState<FileRow[]>([]);
	const [file, setFile] = useState("");
	const [fileFilter, setFileFilter] = useState("");
	const [fileSheet, setFileSheet] = useState(false);
	// The composer sits on an anchor; `lines` is the text of the selected
	// lines, which a suggestion block starts from.
	const [composer, setComposer] = useState<{ anchor: DiffAnchor; lines: string[] | null } | null>(null);
	// The suggestion threads waiting for one commit, and the threads the
	// commit dialog holds while it is open.
	const [batch, setBatch] = useState<ReadonlySet<string>>(() => new Set());
	const [applying, setApplying] = useState<string[] | null>(null);
	const addThread = useMutation({
		mutationFn: (comment: ReviewCommentInput) => client.reviews.add({ pr, ...comment }),
		onSuccess: () => {
			if (composer) {
				const { anchor } = composer;
				localStorage.removeItem(
					`trellis.review.comment:${pr}:${anchor.path}:${anchor.side}:${anchor.startLine}:${anchor.line}`,
				);
			}
			setComposer(null);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
		},
	});
	const loadFile = useCallback(
		async (path: string, side: "old" | "new") => {
			const result = await client.reviews.file({ pr, revisionId: revision!.id, path, side });
			return result.content;
		},
		[client, pr, revision],
	);
	// The diff shows the threads of the revision on screen, plus the threads
	// that name no revision: the CLI wrote those before the PR had one, and
	// their lines refer to the diff of that time. The Discussion tab lists
	// every thread and marks the ones from another revision.
	const everyThread = threads.data?.items ?? noThreads;
	const allThreads = useMemo(
		() => everyThread.filter((thread) => thread.revisionId === null || thread.revisionId === revision?.id),
		[everyThread, revision?.id],
	);
	const threadsById = useMemo(() => new Map(everyThread.map((thread) => [thread.id, thread])), [everyThread]);
	const openCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const thread of allThreads) {
			if (thread.status === "open") counts[thread.path] = (counts[thread.path] ?? 0) + 1;
		}
		return counts;
	}, [allThreads]);
	const renderThread = useCallback(
		(id: string) => {
			const thread = threadsById.get(id)!;
			return <ReviewComment key={thread.id} thread={thread} />;
		},
		[threadsById],
	);
	const fileNav = (
		<ReviewFiles
			search={fileFilter}
			onSearch={setFileFilter}
			files={files}
			selected={file}
			counts={openCounts}
			onSelect={(path) => {
				setFile(path);
				setFileSheet(false);
			}}
		/>
	);
	const displayRevision = revision ? { ...revision, meta: status.data ?? revision.meta } : null;
	const displayMeta = displayRevision?.meta as
		| {
				state?: string;
				statusCheckRollup?: ReviewCheck[];
		  }
		| undefined;
	const checksStatus = checkTabStatus(displayMeta?.statusCheckRollup ?? []);
	const liveStatus = status.data ? liveBranchState(status.data as LiveBranchMeta).label : undefined;
	const toggleBatch = useCallback((threadId: string) => {
		setBatch((current) => {
			const next = new Set(current);
			if (next.has(threadId)) next.delete(threadId);
			else next.add(threadId);
			return next;
		});
	}, []);
	const applyState = useMemo<ReviewApplyState>(
		() => ({
			pr,
			revisionId: revision?.id ?? null,
			headSha: revision?.headSha ?? null,
			prOpen: displayMeta?.state === "OPEN",
			batch,
			toggleBatch,
			apply: setApplying,
		}),
		[pr, revision?.id, revision?.headSha, displayMeta?.state, batch, toggleBatch],
	);
	const applyingThreads = applying === null ? [] : applying.flatMap((id) => threadsById.get(id) ?? []);
	return (
		<ReviewApplyContext.Provider value={applyState}>
			<div className="review-page">
				<ReviewHeader
					pr={pr}
					parent={parent}
					revision={displayRevision}
					refreshing={refresh.isPending || composer !== null}
					onRefresh={refreshAll}
				/>
				<div className="page-card review-workspace">
					<ReviewSummary
						pr={pr}
						revision={displayRevision}
						openThreads={allThreads.filter((thread) => thread.status === "open")}
						showReview={tab === "changes"}
						onAction={() => void status.refetch()}
					/>
					{revision && <ReviewStack pr={pr} />}
					{status.isError && (
						<p role="alert" className="review-notice">
							GitHub status: {status.error.message}
						</p>
					)}
					{revision &&
						status.data &&
						(status.data.headRefOid !== revision.headSha || status.data.baseRefOid !== revision.baseSha) && (
							<button type="button" className="review-notice" onClick={() => refresh.mutate()}>
								The PR has a new revision. Refresh to review it. Current comments keep their original anchors.
							</button>
						)}
					{batch.size > 0 && (
						<ReviewBatchBar
							count={batch.size}
							onCommit={() => setApplying([...batch])}
							onClear={() => setBatch(new Set())}
						/>
					)}
					<ReviewTabs
						value={tab}
						onValueChange={changeTab}
						count={allThreads.length}
						live={pr.includes("/canary-technologies-corp/canary/")}
						checksStatus={checkStatusIndicator(checksStatus)}
						liveStatus={liveStatus ? { label: liveStatus, tone: liveStatusTone(liveStatus) } : undefined}
					>
						{refresh.isError && (
							<p className="review-error" role="alert">
								{refresh.error.message}. Local comments remain available.
							</p>
						)}
						{threads.isError && (
							<p role="alert" className="review-error">
								{threads.error.message}
							</p>
						)}
						{tab === "changes" && revision === null && !refresh.isError && <ReviewPageSkeleton />}
						{tab === "changes" && revision !== null && (
							<div className="review-main">
								<aside className="review-files" aria-label="Changed files">
									{fileNav}
								</aside>
								<div className="review-content">
									<DiffToolbar
										mode={mode}
										onFiles={() => setFileSheet(true)}
										onMode={(value) => {
											setMode(value);
											localStorage.setItem("trellis.review.mode", value);
										}}
									/>

									<ReviewDiff
										filter={fileFilter}
										patch={revision.patch}
										loadFile={loadFile}
										revisionId={revision.id}
										threads={allThreads}
										mode={mode}
										theme={theme}
										selectedFile={file}
										renderThread={renderThread}
										composer={composer?.anchor ?? null}
										renderComposer={() =>
											composer && (
												<ReviewComposer
													key={`${revision.id}:${composer.anchor.path}:${composer.anchor.side}:${composer.anchor.startLine}:${composer.anchor.line}`}
													anchor={composer.anchor}
													lines={composer.lines}
													revisionId={revision.id}
													storageKey={`trellis.review.comment:${pr}:${composer.anchor.path}:${composer.anchor.side}:${composer.anchor.startLine}:${composer.anchor.line}`}
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
										onFiles={setFiles}
									/>
								</div>
							</div>
						)}
						{tab === "discussion" && (
							<ReviewDiscussion
								threads={everyThread}
								activeThread={activeThread}
								revision={displayRevision}
								renderThread={renderThread}
								onJump={(thread) => {
									void (async () => {
										if (thread.revisionId && thread.revisionId !== revision?.id)
											setRevision(await client.reviews.revision({ pr, id: thread.revisionId }));
										setFile(thread.path);
										changeTab("changes");
									})();
								}}
							/>
						)}
						{tab === "checks" && (displayRevision !== null || !refresh.isError) && (
							<ReviewChecks revision={displayRevision} pr={pr} />
						)}
						{tab === "live" && displayRevision && (
							<ReviewLive pr={pr} revision={displayRevision} loading={status.isPending} onRefresh={refreshAll} />
						)}
					</ReviewTabs>
				</div>
				{fileSheet && (
					<Sheet
						open
						title="Changed files"
						titleClassName="font-medium text-base"
						side="left"
						onOpenChange={(open) => !open && setFileSheet(false)}
					>
						<div className="review-file-sheet">{fileNav}</div>
					</Sheet>
				)}
				{applying !== null && revision !== null && applyingThreads.length > 0 && (
					<ApplySuggestionsDialog
						pr={pr}
						headSha={revision.headSha}
						threads={applyingThreads}
						onClose={() => setApplying(null)}
						onApplied={(result) => {
							setApplying(null);
							setBatch((current) => {
								const next = new Set(current);
								for (const thread of result.threads) next.delete(thread.id);
								return next;
							});
							refreshAll();
						}}
					/>
				)}
			</div>
		</ReviewApplyContext.Provider>
	);
}
