import { useQuery } from "@tanstack/react-query";
import { type ReviewSubmission, type ReviewThread, reviewRef } from "@trellis/api";
import { type TabItem, Tabs, useMediaQuery } from "@trellis/ui";
import { type DiffAnchor, ReviewDiffSkeleton, type ThreadPlacement } from "@trellis/ui/review";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { FileRiskGroups } from "../FileRiskGroups";
import { fileGroups } from "../FileRiskGroups/fileGroups";
import { ApplySuggestionsDialog, ReviewApplyContext, type ReviewApplyState, ReviewBatchBar } from "../ReviewApply";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import type { ReviewMetadata } from "../ReviewStack/ReviewStack";
import type { ReadMarkFile } from "../readMarks/readMarks";
import { VerdictBar } from "../VerdictBar";
import { DiffPane } from "./components/DiffPane";
import { FilesDisclosure } from "./components/FilesDisclosure";
import { PaneBoundary } from "./components/PaneBoundary";
import { ReviewFlowPanel } from "./components/ReviewFlowPanel";
import type { GithubPullRequest } from "./components/ReviewIdentity";
import { ReviewIdentitySection } from "./components/ReviewIdentitySection";
import { ReviewNotices } from "./components/ReviewNotices";
import { ReviewOverview } from "./components/ReviewOverview";
import { ReviewTreeSkeleton } from "./components/ReviewPageSkeleton";
import { useActiveThread } from "./hooks/useActiveThread";
import { useLocalReviewVerdict } from "./hooks/useLocalReviewVerdict";
import { useReadMarks } from "./hooks/useReadMarks";
import { useReviewData } from "./hooks/useReviewData";
import type { ReviewTab } from "./reviewTab";
import "@trellis/ui/review.css";

const noThreads: ReviewThread[] = [];
const noSubmissions: ReviewSubmission[] = [];

// Wraps each tab in its own PaneBoundary, so a tab that throws while it
// draws shows its error and the other tabs keep working.
const withBoundaries = (items: TabItem<ReviewTab>[]) =>
	items.map((item) => ({ ...item, content: <PaneBoundary tab={item.value}>{item.content}</PaneBoundary> }));

export type ReviewPageProps = {
	pr: string;
	parent?: ReactNode;
	syncHash?: boolean;
	// The tab selected from the URL, session state, or default rule.
	tab: ReviewTab;
	onTabChange: (tab: ReviewTab) => void;
};

export function ReviewPage({ pr, parent, syncHash = true, tab, onTabChange }: ReviewPageProps) {
	const { orpc } = useApp();
	const activeThread = useActiveThread(syncHash);
	const { revision, status, run, linkedPr, overview, identity, ticket, threads, submissions, refresh, refreshAll } =
		useReviewData(pr);
	const [changedFiles, setChangedFiles] = useState<ReadMarkFile[]>([]);
	const { read, setRead } = useReadMarks(pr, changedFiles);
	const ref = reviewRef(pr);
	// One order governs both panes of the Diff tab. The groups rank the files,
	// the tree draws them in that rank, and the diff draws them in the same
	// rank, so the row a person picks in the tree sits at the same place in the
	// diff. The rank ignores the read marks, so a mark never re-sorts the diff
	// under the pointer.
	const groups = useMemo(() => fileGroups(ref.repo, changedFiles), [ref.repo, changedFiles]);
	// `FilesDisclosure` hides the review details behind one control on a phone.
	const phone = useMediaQuery("(max-width: 767px)");
	const [pickedPath, setPickedPath] = useState("");
	const [pickedAnchor, setPickedAnchor] = useState<DiffAnchor | null>(null);
	const [pickedFinding, setPickedFinding] = useState<{ id: string; path: string } | null>(null);
	const [filesOpen, setFilesOpen] = useState(false);
	const [batch, setBatch] = useState<ReadonlySet<string>>(() => new Set());
	const [applying, setApplying] = useState<string[] | null>(null);
	// The diff shows every thread of the pull request, whichever revision it
	// names. `ReviewDiff` searches the file on screen for the lines a thread
	// of an earlier revision was written against, and draws the thread at the
	// top of its file when the file holds those lines no more.
	const allThreads = threads.data?.items ?? noThreads;
	const threadsById = useMemo(() => new Map(allThreads.map((thread) => [thread.id, thread])), [allThreads]);
	const renderThread = useCallback(
		(id: string, place: ThreadPlacement) => {
			const thread = threadsById.get(id)!;
			return <ReviewComment key={thread.id} thread={thread} pr={pr} place={place} />;
		},
		[threadsById, pr],
	);
	const statusMatchesRevision =
		revision !== null && status.data?.headRefOid === revision.headSha && status.data?.baseRefOid === revision.baseSha;
	const displayRevision = revision ? { ...revision, meta: statusMatchesRevision ? status.data! : revision.meta } : null;
	const displayMeta = identity as GithubPullRequest | undefined;
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
	// A file-list choice overrides the path of a linked thread.
	const deepLinkPath = activeThread === null ? undefined : threadsById.get(activeThread)?.path;
	const selectedPath = pickedPath !== "" ? pickedPath : (pickedAnchor?.path ?? deepLinkPath ?? "");
	const allSubmissions = submissions.data ?? noSubmissions;
	const verdict = useLocalReviewVerdict(submissions.data);
	const metadata = useQuery({
		...orpc.reviews.metadata.queryOptions({ input: { pr } }),
		enabled: revision !== null || status.data?.isQueued === true,
	});
	const reviewMetadata = metadata.data as ReviewMetadata | undefined;
	// A diff flow uses its ticket for project context and records the current head commit.
	const flowTarget =
		status.data?.ticket == null || status.data.prRow === null
			? null
			: { ticket: status.data.ticket.identifier, headSha: status.data.headRefOid, diffId: status.data.prRow.id };
	return (
		<ReviewApplyContext.Provider value={applyState}>
			<div className="review-page">
				<ReviewHeader pr={pr} parent={parent} revision={displayRevision} verdict={verdict ?? null} />
				<ReviewIdentitySection
					pr={pr}
					revision={displayRevision}
					pullRequest={displayMeta}
					isQueued={overview.data?.pullRequest.isQueued ?? false}
					linkedPr={linkedPr}
					localState={overview.data?.pullRequest.localState ?? null}
					locallyApproved={verdict === undefined ? null : verdict === "approved"}
					mergeQueuePosition={reviewMetadata?.mergeQueueEntry?.position}
					onAction={refreshAll}
					ticket={ticket}
				/>
				<ReviewNotices
					pr={pr}
					hasRevision={revision !== null}
					metadata={reviewMetadata}
					metadataError={metadata.error}
					statusError={status.isError ? status.error.message : null}
					refreshError={refresh.isError ? refresh.error.message : null}
					threadsError={threads.isError ? threads.error.message : null}
					submissionsError={submissions.isError ? submissions.error.message : null}
					retrySubmissions={() => void submissions.refetch()}
				/>
				{/* Every panel stays mounted: `DiffPane` reports the changed file list
				    that the tree draws, and the diff keeps its scroll position while
				    another tab shows. `withBoundaries` gives each panel its own error. */}
				<Tabs
					value={tab}
					onValueChange={onTabChange}
					keepMounted
					className="review-body"
					panelClassName="review-tab-panel"
					items={withBoundaries([
						{
							value: "overview",
							label: "Overview",
							content: (
								<ReviewOverview
									ready={overview.isSuccess}
									error={overview.error}
									onRetry={() => void overview.refetch()}
									linked={linkedPr !== null}
									summary={overview.data?.summary ?? null}
									evidence={overview.data?.evidence ?? null}
									threads={allThreads}
									revision={revision}
									onOpen={(path, anchor, threadId) => {
										setPickedPath(path);
										setPickedAnchor(anchor);
										setPickedFinding({ id: threadId, path: anchor?.path ?? path });
										setFilesOpen(true);
										onTabChange("diff");
									}}
								/>
							),
						},
						{
							value: "checks",
							label: "Checks",
							content: (
								<div className="review-blocks">
									<ReviewChecks
										checks={overview.data?.pullRequest.fetchedAt ? overview.data.pullRequest.checks : null}
										pr={pr}
									/>
								</div>
							),
						},
						{
							value: "flows",
							label: "Flows",
							content: <ReviewFlowPanel target={flowTarget} />,
						},
						{
							value: "diff",
							label: "Diff",
							content: (
								<FilesDisclosure phone={phone} count={changedFiles.length} open={filesOpen} onOpenChange={setFilesOpen}>
									<div className="review-panes">
										<aside className="review-tree-pane" aria-label="The changed files">
											{revision === null ? (
												<ReviewTreeSkeleton />
											) : (
												<FileRiskGroups
													pr={pr}
													groups={groups}
													read={read}
													selected={selectedPath}
													onSelect={(path) => {
														setPickedPath(path);
														if (path !== selectedPath) setPickedFinding(null);
														// The tree reports the file of the anchor back as a
														// choice of its own. A choice of another file drops
														// the anchor; the echo of this one keeps it.
														setPickedAnchor((current) => (current?.path === path ? current : null));
													}}
												/>
											)}
										</aside>
										<div className="review-diff-pane">
											{revision === null ? (
												!refresh.isError && <ReviewDiffSkeleton />
											) : (
												<DiffPane
													pr={pr}
													revision={revision}
													threads={allThreads}
													selectedFile={selectedPath}
													selectedAnchor={pickedAnchor}
													selectedFinding={pickedFinding}
													active={tab === "diff"}
													renderThread={renderThread}
													onFiles={setChangedFiles}
													groups={groups}
													read={read}
													onRead={(path, next) => {
														setPickedFinding(null);
														setRead(path, next);
													}}
												/>
											)}
										</div>
									</div>
								</FilesDisclosure>
							),
						},
					])}
				/>
				<div className="review-action-bars">
					{batch.size > 0 && (
						<ReviewBatchBar
							count={batch.size}
							onCommit={() => setApplying([...batch])}
							onClear={() => setBatch(new Set())}
						/>
					)}
					{displayRevision && (
						<VerdictBar
							pr={pr}
							revision={displayRevision}
							ticket={ticket?.identifier ?? null}
							run={run}
							submissions={allSubmissions}
							submissionsFetched={submissions.isFetched}
							onDone={refreshAll}
						/>
					)}
				</div>
				{applying !== null && revision !== null && applyingThreads.length > 0 && (
					<ApplySuggestionsDialog
						pr={pr}
						headSha={revision.headSha}
						threads={applyingThreads}
						onClose={() => setApplying(null)}
						onHeadMoved={refreshAll}
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
