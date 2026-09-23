import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { isAgentWorking, type ReviewSubmission, type ReviewThread, reviewRef, turnOf, verdictMark } from "@trellis/api";
import { EmptyState, Skeleton, type TabItem, Tabs, TicketId, useMediaQuery } from "@trellis/ui";
import { type DiffAnchor, type ThreadPlacement, threadDiffLine } from "@trellis/ui/review";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ChangeSummary } from "../ChangeSummary";
import { EvidenceDocument } from "../EvidenceDocument";
import { FileRiskGroups } from "../FileRiskGroups";
import { FlowRuns } from "../FlowRuns";
import { ApplySuggestionsDialog, ReviewApplyContext, type ReviewApplyState, ReviewBatchBar } from "../ReviewApply";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { ReviewFindings } from "../ReviewFindings";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import { type ReviewMetadata, ReviewStack } from "../ReviewStack/ReviewStack";
import type { ReadMarkFile } from "../readMarks/readMarks";
import { VerdictBar } from "../VerdictBar";
import { DiffPane } from "./components/DiffPane";
import { FilesDisclosure } from "./components/FilesDisclosure";
import { PaneBoundary } from "./components/PaneBoundary";
import { type GithubPullRequest, ReviewIdentity } from "./components/ReviewIdentity";
import { ReviewDiffSkeleton, ReviewTreeSkeleton } from "./components/ReviewPageSkeleton";
import { TurnLine } from "./components/TurnLine";
import { useActiveThread } from "./hooks/useActiveThread";
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
	const {
		revision,
		status,
		ticket,
		run,
		linkedPr,
		summary,
		evidence,
		overviewReady,
		threads,
		submissions,
		refresh,
		refreshAll,
	} = useReviewData(pr);
	const [changedFiles, setChangedFiles] = useState<ReadMarkFile[]>([]);
	const { read, setRead } = useReadMarks(pr, changedFiles);
	// `FilesDisclosure` hides the review details behind one control on a phone.
	const phone = useMediaQuery("(max-width: 767px)");
	const [pickedPath, setPickedPath] = useState("");
	const [pickedAnchor, setPickedAnchor] = useState<DiffAnchor | null>(null);
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
			return <ReviewComment key={thread.id} thread={thread} place={place} />;
		},
		[threadsById],
	);
	const statusMatchesRevision =
		revision !== null && status.data?.headRefOid === revision.headSha && status.data?.baseRefOid === revision.baseSha;
	const displayRevision = revision ? { ...revision, meta: statusMatchesRevision ? status.data! : revision.meta } : null;
	const displayMeta = displayRevision?.meta as GithubPullRequest | undefined;
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
	const headSha = revision?.headSha ?? "";
	const allSubmissions = submissions.data ?? noSubmissions;
	const summaryRow = summary.data ?? null;
	const prRow = status.data?.prRow ?? null;
	const metadata = useQuery({
		...orpc.reviews.metadata.queryOptions({ input: { pr } }),
		enabled: revision !== null || status.data?.isQueued === true,
	});
	const reviewMetadata = metadata.data as ReviewMetadata | undefined;
	// The ticket row also knows the ticket status and its dependencies.
	// `prRow` is the fallback for a pull request that no ticket links.
	const turnInput = ticket.data ?? prRow;
	const agentWorks = run !== null && isAgentWorking(run);
	const turn = turnInput ? turnOf(turnInput, agentWorks) : null;
	const ref = reviewRef(pr);
	// What the Flows tab needs to start a flow. One `gh pr view` answer carries
	// both the ticket and the head commit, so either both are here or neither
	// is.
	const flowTarget =
		status.data?.ticket == null ? null : { ticket: status.data.ticket.identifier, headSha: status.data.headRefOid };
	return (
		<ReviewApplyContext.Provider value={applyState}>
			<div className="review-page">
				<ReviewHeader pr={pr} parent={parent} revision={displayRevision} verdict={verdictMark(allSubmissions)} />
				{/* The identity stays above the column, so the buttons that end
				    the review are always in reach. */}
				<div className="review-identity">
					<ReviewIdentity
						pr={pr}
						revision={displayRevision}
						pullRequest={displayMeta}
						isQueued={status.data?.isQueued ?? false}
						linkedPr={linkedPr}
						mergeQueuePosition={reviewMetadata?.mergeQueueEntry?.position}
						onAction={refreshAll}
					/>
					<div className="review-identity-lines">
						{status.data?.ticket && (
							<p className="review-ticket-line">
								<Link to="/t/$identifier" params={{ identifier: status.data.ticket.identifier }}>
									<TicketId id={status.data.ticket.identifier} />
								</Link>{" "}
								{status.data.ticket.title}
							</p>
						)}
						{turn !== null && (
							<TurnLine turn={turn} prRow={prRow} mergedOn={linkedPr?.mergedAt?.slice(0, 10) ?? null} />
						)}
					</div>
				</div>
				{/* The notices sit above the tabs, so both tabs show them. The box
				    is empty while nothing went wrong, and an empty box draws nothing. */}
				<div className="review-notices">
					{revision && <ReviewStack pr={pr} meta={reviewMetadata} error={metadata.error} />}
					{status.isError && (
						<p role="alert" className="review-notice">
							GitHub status: {status.error.message}
						</p>
					)}
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
				</div>
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
								<div className="review-blocks">
									{/* Trellis stores the summary and the evidence document under the
									    linked pull request row, so a pull request that no ticket links
									    draws neither. */}
									{!overviewReady ? (
										<section aria-busy="true">
											<span className="sr-only" role="status">
												The overview is loading.
											</span>
											<Skeleton lines={10} />
										</section>
									) : (
										<>
											{linkedPr !== null && <ChangeSummary summary={summaryRow} headSha={headSha} />}
											{linkedPr !== null && <EvidenceDocument evidence={evidence.data ?? null} />}
											<ReviewFindings
												threads={allThreads}
												revisionId={revision?.id ?? null}
												onOpen={(thread) => {
													// A thread of an earlier revision names a line of a diff
													// that this page does not draw, so the link asks the
													// patch on screen where that thread went. No line means
													// the diff draws the thread at the top of its file, and
													// the link goes to that file.
													const line = revision === null ? null : threadDiffLine(revision.patch, thread, revision.id);
													setPickedPath(line === null ? thread.path : "");
													setPickedAnchor(
														line === null ? null : { path: thread.path, side: thread.side, line, startLine: line },
													);
													onTabChange("diff");
												}}
											/>
										</>
									)}
								</div>
							),
						},
						{
							value: "checks",
							label: "Checks",
							content: (
								<div className="review-blocks">
									<ReviewChecks checks={status.data?.checks ?? null} pr={pr} />
								</div>
							),
						},
						{
							value: "flows",
							label: "Flows",
							content: (
								<div className="review-blocks">
									{/* A flow runs against a ticket, so a pull request that no
									    ticket links can hold no flow run. */}
									{flowTarget === null ? (
										<EmptyState
											title="No flow runs"
											description="No ticket links this pull request, and a flow runs against a ticket."
										/>
									) : (
										<FlowRuns ticket={flowTarget.ticket} headSha={flowTarget.headSha} />
									)}
								</div>
							),
						},
						{
							value: "diff",
							label: "Diff",
							content: (
								<FilesDisclosure phone={phone} count={changedFiles.length}>
									<div className="review-panes">
										<aside className="review-tree-pane" aria-label="The changed files">
											{revision === null ? (
												<ReviewTreeSkeleton />
											) : (
												<FileRiskGroups
													pr={pr}
													repo={ref.repo}
													files={changedFiles}
													read={read}
													selected={selectedPath}
													onSelect={(path) => {
														setPickedPath(path);
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
													renderThread={renderThread}
													onFiles={setChangedFiles}
													read={read}
													onRead={setRead}
												/>
											)}
										</div>
									</div>
								</FilesDisclosure>
							),
						},
					])}
				/>
				{/* The two cards float over the bottom right of the page. The box
				    draws nothing while both are absent. */}
				<div className="review-float-bars">
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
							ticket={status.data?.ticket?.identifier ?? null}
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
