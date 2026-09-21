import { Link } from "@tanstack/react-router";
import {
	type Evidence,
	evidenceFloor,
	isAgentWorking,
	type ReviewRevision,
	type ReviewSubmission,
	type ReviewThread,
	reviewRef,
	turnOf,
	verdictMark,
} from "@trellis/api";
import { Skeleton, Tabs, TicketId, useMediaQuery } from "@trellis/ui";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ChangeSummary } from "../ChangeSummary";
import { ConditionsBlock } from "../ConditionsBlock";
import { EvidenceStrip } from "../EvidenceStrip";
import { FileRiskGroups } from "../FileRiskGroups";
import { ApplySuggestionsDialog, ReviewApplyContext, type ReviewApplyState, ReviewBatchBar } from "../ReviewApply";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { ReviewDiscussion } from "../ReviewDiscussion/ReviewDiscussion";
import { ReviewFocusList } from "../ReviewFocusList";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import { ReviewStack } from "../ReviewStack/ReviewStack";
import type { ReadMarkFile } from "../readMarks/readMarks";
import { VerdictBar } from "../VerdictBar";
import { DiffPane } from "./components/DiffPane";
import { FilesDisclosure } from "./components/FilesDisclosure";
import { type GithubPullRequest, ReviewIdentity } from "./components/ReviewIdentity";
import { ReviewDiffSkeleton, ReviewTreeSkeleton } from "./components/ReviewPageSkeleton";
import { TurnLine } from "./components/TurnLine";
import { baseOf, conditionsOf } from "./conditionsOf";
import { useActiveThread } from "./hooks/useActiveThread";
import { useReadMarks } from "./hooks/useReadMarks";
import { useReviewData } from "./hooks/useReviewData";
import { defaultReviewTab, type ReviewTab } from "./reviewTab";
import "@trellis/ui/review.css";

const noThreads: ReviewThread[] = [];
const noSubmissions: ReviewSubmission[] = [];
const noRecords: Evidence[] = [];
const noSentences: string[] = [];

type Commit = { oid: string; messageHeadline: string };
const commitsOf = (revision: ReviewRevision | null) =>
	((revision?.meta.commits as Commit[] | undefined) ?? []).filter(
		(commit) => typeof commit.oid === "string" && typeof commit.messageHeadline === "string",
	);

export type ReviewPageProps = {
	pr: string;
	parent?: ReactNode;
	syncHash?: boolean;
	// The tab the person picked, or undefined while they picked none. The page
	// then shows the tab that `defaultReviewTab` picks.
	tab: ReviewTab | undefined;
	onTabChange: (tab: ReviewTab) => void;
};

export function ReviewPage({ pr, parent, syncHash = true, tab, onTabChange }: ReviewPageProps) {
	const { client } = useApp();
	const activeThread = useActiveThread(syncHash);
	const {
		revision,
		setRevision,
		status,
		ticket,
		run,
		linkedPr,
		summary,
		evidence,
		factsReady,
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
	const [batch, setBatch] = useState<ReadonlySet<string>>(() => new Set());
	const [applying, setApplying] = useState<string[] | null>(null);
	// The diff shows the threads of the revision on screen, plus the threads
	// that name no revision: the CLI wrote those before the pull request had
	// one, and their lines refer to the diff of that time. `ReviewDiscussion`
	// lists every thread and marks the ones from another revision.
	const allThreads = threads.data?.items ?? noThreads;
	const revisionThreads = useMemo(
		() => allThreads.filter((thread) => thread.revisionId === null || thread.revisionId === revision?.id),
		[allThreads, revision?.id],
	);
	const threadsById = useMemo(() => new Map(allThreads.map((thread) => [thread.id, thread])), [allThreads]);
	const renderThread = useCallback(
		(id: string) => {
			const thread = threadsById.get(id)!;
			return <ReviewComment key={thread.id} thread={thread} />;
		},
		[threadsById],
	);
	const statusMatchesRevision =
		revision !== null && status.data?.headRefOid === revision.headSha && status.data?.baseRefOid === revision.baseSha;
	const displayRevision = revision ? { ...revision, meta: statusMatchesRevision ? status.data! : revision.meta } : null;
	const displayMeta = displayRevision?.meta as GithubPullRequest | undefined;
	const openedReview = useRef<{ pr: string; commits: ReadonlySet<string> } | null>(null);
	if (revision !== null && openedReview.current?.pr !== pr)
		openedReview.current = { pr, commits: new Set(commitsOf(revision).map((commit) => commit.oid)) };
	const newCommits = commitsOf(revision).filter((commit) => !openedReview.current?.commits.has(commit.oid));
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
	const selectedPath = pickedPath !== "" ? pickedPath : (deepLinkPath ?? "");
	// The summary and evidence records must match the revision on screen.
	const headSha = revision?.headSha ?? "";
	const records = useMemo(
		() => (evidence.data ?? noRecords).filter((record) => record.headSha === headSha),
		[evidence.data, headSha],
	);
	const allSubmissions = submissions.data ?? noSubmissions;
	const summaryRow = summary.data ?? null;
	const prRow = status.data?.prRow ?? null;
	const floor =
		prRow === null || prRow.kind === null || prRow.risk === null
			? null
			: evidenceFloor({
					kind: prRow.kind,
					risk: prRow.risk,
					rows: records,
					hasSummary: summaryRow !== null && summaryRow.headSha === headSha,
				});
	const conditions = conditionsOf({
		prRow,
		records,
		floor,
		waitsOn: ticket.data?.waitsOn ?? [],
		base: baseOf(displayRevision, prRow?.baseRef ?? displayMeta?.baseRefName ?? "unknown"),
	});
	// The ticket row also knows the ticket status and its dependencies.
	// `prRow` is the fallback for a pull request that no ticket links.
	const turnInput = ticket.data ?? prRow;
	const agentWorks = run !== null && isAgentWorking(run);
	// The default tab is fixed the first time the turn is known, so a turn
	// that changes while the person reads does not move them to the other tab.
	const turn = turnInput ? turnOf(turnInput, agentWorks) : null;
	const firstTurn = useRef<ReviewTab | null>(null);
	if (firstTurn.current === null && turn !== null) firstTurn.current = defaultReviewTab(turn);
	const shownTab = tab ?? firstTurn.current ?? defaultReviewTab(null);
	const ref = reviewRef(pr);
	return (
		<ReviewApplyContext.Provider value={applyState}>
			<div className="review-page">
				<ReviewHeader
					pr={pr}
					parent={parent}
					revision={displayRevision}
					verdict={revision === null ? null : verdictMark(allSubmissions, revision.headSha)}
				/>
				{/* The identity stays above the column, so the buttons that end
				    the review are always in reach. */}
				<div className="review-identity">
					<ReviewIdentity
						pr={pr}
						revision={displayRevision}
						pullRequest={displayMeta}
						isQueued={status.data?.isQueued ?? false}
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
					{revision && <ReviewStack pr={pr} />}
					{newCommits.length > 0 && (
						<p role="status" className="review-notice">
							New since you opened this review:{" "}
							{newCommits.map((commit) => `${commit.oid.slice(0, 7)} ${commit.messageHeadline}`).join("; ")}. Read these
							commits before you merge.
						</p>
					)}
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
				{/* Both panels stay mounted: `DiffPane` reports the changed file list
				    that the tree draws, and the diff keeps its scroll position while
				    the Facts tab shows. */}
				<Tabs
					value={shownTab}
					onValueChange={onTabChange}
					keepMounted
					className="review-body"
					panelClassName="review-tab-panel"
					items={[
						{
							value: "facts",
							label: "Facts",
							content: (
								<div className="review-facts-blocks">
									{!factsReady || conditions === null ? (
										<section aria-busy="true">
											<span className="sr-only" role="status">
												Merge conditions are loading.
											</span>
											<Skeleton lines={10} />
										</section>
									) : (
										<>
											<ChangeSummary summary={summaryRow} headSha={headSha} />
											<ConditionsBlock conditions={conditions} />
											{revision && (
												<ReviewFocusList
													pr={pr}
													revisionId={revision.id}
													sentences={ticket.data?.contract.reviewFocus ?? noSentences}
												/>
											)}
											{floor && <EvidenceStrip records={records} floor={floor} />}
										</>
									)}
									<ReviewChecks checks={status.data?.checks ?? null} pr={pr} />
									<ReviewDiscussion
										threads={allThreads}
										activeThread={activeThread}
										revision={displayRevision}
										renderThread={renderThread}
										onJump={(thread) => {
											void (async () => {
												if (thread.revisionId && thread.revisionId !== revision?.id)
													setRevision(await client.reviews.revision({ pr, id: thread.revisionId }));
												setPickedPath(thread.path);
												onTabChange("diff");
											})();
										}}
									/>
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
													onSelect={setPickedPath}
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
													threads={revisionThreads}
													selectedFile={selectedPath}
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
					]}
				/>
				{displayRevision && (
					<VerdictBar
						pr={pr}
						revision={displayRevision}
						ticket={status.data?.ticket?.identifier ?? null}
						run={run}
						submissions={allSubmissions}
						onDone={refreshAll}
					/>
				)}
				{batch.size > 0 && (
					<ReviewBatchBar
						count={batch.size}
						onCommit={() => setApplying([...batch])}
						onClear={() => setBatch(new Set())}
					/>
				)}
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
