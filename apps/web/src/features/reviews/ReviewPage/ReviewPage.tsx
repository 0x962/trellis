import { Link } from "@tanstack/react-router";
import { type Evidence, evidenceFloor, type ReviewRevision, type ReviewThread, reviewRef, turnOf } from "@trellis/api";
import { TicketId } from "@trellis/ui";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ChangeSummary } from "../ChangeSummary";
import { ConditionsBlock } from "../ConditionsBlock";
import { type BaseCondition, unmetConditions } from "../conditionLines/conditionLines";
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
import { ReviewSummary } from "../ReviewSummary/ReviewSummary";
import { primaryReviewAction, type ReviewActionMeta } from "../reviewActions/reviewActions";
import { VerdictBar } from "../VerdictBar";
import { DiffPane } from "./components/DiffPane";
import { ReviewPageSkeleton } from "./components/ReviewPageSkeleton";
import { TurnLine } from "./components/TurnLine";
import { conditionsOf } from "./conditionsOf";
import { useActiveThread } from "./hooks/useActiveThread";
import { useReviewData } from "./hooks/useReviewData";
import "@trellis/ui/review.css";

const noThreads: ReviewThread[] = [];
const noRecords: Evidence[] = [];
const noSentences: string[] = [];
// `conditionsOf` answers null while the pull request row has no risk
// answers. An empty list would read as "every condition is met", so the
// bar prints one phrase for the gap instead.
const conditionsUnknown = ["conditions unknown"];

// The distance comes from the revision document, not from the status poll:
// the server reads it from the compare call that fetched this revision, and
// the poll answers no such field. A revision stored before the server read
// the distance carries none, and the line then reads unknown.
const baseOf = (revision: ReviewRevision | null): BaseCondition | null => {
	const meta = revision?.meta as { behindBy?: number; baseRefName?: string } | undefined;
	if (meta?.behindBy === undefined || meta.baseRefName === undefined) return null;
	return { behindBy: meta.behindBy, baseRefName: meta.baseRefName };
};

export function ReviewPage({ pr, parent, syncHash = true }: { pr: string; parent?: ReactNode; syncHash?: boolean }) {
	const { client } = useApp();
	const activeThread = useActiveThread(syncHash);
	const {
		revision,
		setRevision,
		status,
		ticket,
		linkedPr,
		summary,
		evidence,
		factsReady,
		threads,
		refresh,
		refreshAll,
	} = useReviewData(pr);
	const [changedFiles, setChangedFiles] = useState<ReadMarkFile[]>([]);
	// The path the reader picked in the file list, or an empty string while
	// the reader picked none.
	const [pickedPath, setPickedPath] = useState("");
	const [composerOpen, setComposerOpen] = useState(false);
	// The suggestion threads waiting for one commit, and the threads the
	// commit dialog holds while it is open.
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
	const displayRevision = revision ? { ...revision, meta: status.data ?? revision.meta } : null;
	const displayMeta = displayRevision?.meta as { state?: string } | undefined;
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
	// A link with `?thread=<id>` in the hash opens the file that the thread
	// sits on, so the diff below shows that file. A pick in the file list wins
	// from then on, and the threads can arrive after the reader picks.
	const deepLinkPath = activeThread === null ? undefined : threadsById.get(activeThread)?.path;
	const selectedPath = pickedPath !== "" ? pickedPath : (deepLinkPath ?? "");
	// The conditions, the summary and the evidence records belong to the commit
	// whose diff the page draws. A summary or an evidence record written for
	// another commit counts as missing, and the notice above them asks the
	// reader to refresh.
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
		base: baseOf(revision),
	});
	// `turnOf` takes `hasWorkingRun` as its second argument. This page loads no
	// agent run, so it passes false. A ticket with a running agent then gets
	// its turn from the state of the pull request.
	// The ticket row answers first, because it also knows the ticket status and
	// the tickets it waits on. `prRow` is the fallback for a pull request that
	// no ticket links.
	const turnInput = ticket.data ?? prRow;
	const ref = reviewRef(pr);
	return (
		<ReviewApplyContext.Provider value={applyState}>
			<div className="review-page">
				<ReviewHeader
					pr={pr}
					parent={parent}
					revision={displayRevision}
					refreshing={refresh.isPending || composerOpen}
					onRefresh={refreshAll}
				/>
				{/* The identity stays above the column, so the buttons that end
				    the review are always in reach. */}
				<div className="review-identity">
					<ReviewSummary
						pr={pr}
						revision={displayRevision}
						openThreads={allThreads.filter((thread) => thread.status === "open")}
						showReview
						onAction={() => void status.refetch()}
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
								turn={turnOf(turnInput, false)}
								prRow={prRow}
								mergedOn={linkedPr?.mergedAt?.slice(0, 10) ?? null}
							/>
						)}
					</div>
				</div>
				<div className="review-column">
					<div className="review-regions">
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
						{factsReady && (
							<>
								{conditions && <ConditionsBlock conditions={conditions} />}
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
						<ReviewChecks revision={displayRevision} pr={pr} />
						{revision === null && !refresh.isError ? (
							<ReviewPageSkeleton />
						) : (
							revision && (
								<>
									<FileRiskGroups
										pr={pr}
										repo={ref.repo}
										files={changedFiles}
										selected={selectedPath}
										onSelect={setPickedPath}
									/>
									<DiffPane
										pr={pr}
										revision={revision}
										threads={revisionThreads}
										selectedFile={selectedPath}
										renderThread={renderThread}
										onFiles={setChangedFiles}
										onComposer={setComposerOpen}
									/>
								</>
							)
						)}
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
					</div>
				</div>
				{displayRevision && primaryReviewAction(displayRevision.meta as ReviewActionMeta) === "merge" && (
					<VerdictBar
						pr={pr}
						revision={displayRevision}
						openThreads={revisionThreads.filter((thread) => thread.status === "open").length}
						unmetConditions={conditions === null ? conditionsUnknown : unmetConditions(conditions)}
						onDone={() => void status.refetch()}
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
