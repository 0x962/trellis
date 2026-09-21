import { Link } from "@tanstack/react-router";
import {
	type Evidence,
	evidenceFloor,
	isAgentWorking,
	type ReviewRevision,
	type ReviewThread,
	reviewRef,
	turnOf,
} from "@trellis/api";
import { Skeleton, TicketId, useMediaQuery } from "@trellis/ui";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups";
import { ChangeSummary } from "../ChangeSummary";
import { ConditionsBlock } from "../ConditionsBlock";
import { unmetConditions } from "../conditionLines/conditionLines";
import { EvidenceStrip } from "../EvidenceStrip";
import { FileRiskGroups } from "../FileRiskGroups";
import type { ReadMarkFile } from "../FileRiskGroups/readMarks/readMarks";
import { ApplySuggestionsDialog, ReviewApplyContext, type ReviewApplyState, ReviewBatchBar } from "../ReviewApply";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { ReviewDiscussion } from "../ReviewDiscussion/ReviewDiscussion";
import { ReviewFocusList } from "../ReviewFocusList";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import { ReviewStack } from "../ReviewStack/ReviewStack";
import { primaryReviewAction } from "../reviewActions/reviewActions";
import { VerdictBar } from "../VerdictBar";
import { DiffPane } from "./components/DiffPane";
import { FilesDisclosure } from "./components/FilesDisclosure";
import { factsLine, ReviewFacts } from "./components/ReviewFacts";
import { type GithubPullRequest, ReviewIdentity } from "./components/ReviewIdentity";
import { ReviewDiffSkeleton, ReviewTreeSkeleton } from "./components/ReviewPageSkeleton";
import { TurnLine } from "./components/TurnLine";
import { baseOf, conditionsOf } from "./conditionsOf";
import { useActiveThread } from "./hooks/useActiveThread";
import { useReviewData } from "./hooks/useReviewData";
import "@trellis/ui/review.css";

const noThreads: ReviewThread[] = [];
const noRecords: Evidence[] = [];
const noSentences: string[] = [];
// The facts strip starts shut, so the file tree and the diff start near the
// top of the sheet.
const factsGroup = "facts";
const factsShut = [factsGroup];

type Commit = { oid: string; messageHeadline: string };
const commitsOf = (revision: ReviewRevision | null) =>
	((revision?.meta.commits as Commit[] | undefined) ?? []).filter(
		(commit) => typeof commit.oid === "string" && typeof commit.messageHeadline === "string",
	);

export function ReviewPage({ pr, parent, syncHash = true }: { pr: string; parent?: ReactNode; syncHash?: boolean }) {
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
		refresh,
		refreshAll,
	} = useReviewData(pr);
	const [changedFiles, setChangedFiles] = useState<ReadMarkFile[]>([]);
	const { isCollapsed, toggle: toggleFacts } = useCollapsedGroups(`${pr}#facts`, factsShut);
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
	// `reviews.submit` accepts only open threads of the revision on screen.
	const drafts = useMemo(
		() =>
			allThreads
				.filter((thread) => thread.status === "open" && thread.revisionId === revision?.id)
				.map((thread) => thread.id),
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
	const showMerge = displayMeta !== undefined && primaryReviewAction(displayMeta) === "merge";
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
	const canMerge = showMerge && conditions !== null;
	// The ticket row also knows the ticket status and its dependencies.
	// `prRow` is the fallback for a pull request that no ticket links.
	const turnInput = ticket.data ?? prRow;
	const agentWorks = run !== null && isAgentWorking(run);
	const ref = reviewRef(pr);
	return (
		<ReviewApplyContext.Provider value={applyState}>
			<div className="review-page">
				<ReviewHeader pr={pr} parent={parent} revision={displayRevision} />
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
						{turnInput && (
							<TurnLine
								turn={turnOf(turnInput, agentWorks)}
								prRow={prRow}
								mergedOn={linkedPr?.mergedAt?.slice(0, 10) ?? null}
							/>
						)}
					</div>
				</div>
				<div className="review-body">
					{/* The notices sit outside the facts strip, because a shut strip
					    would hide them. The box is empty while nothing went wrong, and
					    an empty box draws nothing. */}
					<div className="review-notices">
						{revision && <ReviewStack pr={pr} />}
						{newCommits.length > 0 && (
							<p role="status" className="review-notice">
								New since you opened this review:{" "}
								{newCommits.map((commit) => `${commit.oid.slice(0, 7)} ${commit.messageHeadline}`).join("; ")}. Read
								these commits before you merge.
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
					<ReviewFacts
						line={factsLine(conditions)}
						shut={isCollapsed(factsGroup)}
						onToggle={() => toggleFacts(factsGroup)}
						phone={phone}
					>
						{!factsReady || conditions === null ? (
							<section aria-busy="true">
								<span className="sr-only" role="status">
									Merge conditions are loading.
								</span>
								<Skeleton lines={10} />
							</section>
						) : (
							<>
								<ConditionsBlock conditions={conditions} />
								<ChangeSummary summary={summaryRow} headSha={headSha} />
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
								})();
							}}
						/>
					</ReviewFacts>
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
									/>
								)}
							</div>
						</div>
					</FilesDisclosure>
				</div>
				{displayRevision && (canMerge || status.data?.ticket) && (
					<VerdictBar
						pr={pr}
						revision={displayRevision}
						ticket={status.data?.ticket?.identifier ?? null}
						run={run}
						drafts={drafts}
						unmetConditions={conditions === null ? [] : unmetConditions(conditions)}
						phone={phone}
						showMerge={canMerge}
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
