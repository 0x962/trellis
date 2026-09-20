import { Link } from "@tanstack/react-router";
import { type Evidence, evidenceFloor, type ReviewThread, reviewRef, turnOf } from "@trellis/api";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
import { type LiveBranchMeta, liveBranchState } from "../ReviewLive/liveBranch";
import { ReviewStack } from "../ReviewStack/ReviewStack";
import { ReviewSummary } from "../ReviewSummary/ReviewSummary";
import { type DiffFile, DiffRegion } from "./components/DiffRegion";
import { ReviewPageSkeleton } from "./components/ReviewPageSkeleton";
import { TurnLine } from "./components/TurnLine";
import { conditionsOf } from "./conditionsOf";
import { useReviewData } from "./hooks/useReviewData";
import { useReviewNavigation } from "./hooks/useReviewNavigation";
import "@trellis/ui/review.css";

const noThreads: ReviewThread[] = [];
const noRecords: Evidence[] = [];
const noSentences: string[] = [];

// The review page reads top to bottom in nine regions: the identity with the
// turn line, the merge conditions, the summary the agent wrote, the review
// focus of the ticket, the evidence, the checks, the changed files by risk,
// the threads, and the controls that end the review.
export function ReviewPage({ pr, parent, syncHash = true }: { pr: string; parent?: ReactNode; syncHash?: boolean }) {
	const { client } = useApp();
	const { activeThread } = useReviewNavigation(syncHash);
	const { revision, setRevision, status, ticket, linkedPr, summary, evidence, threads, refresh, refreshAll } =
		useReviewData(pr);
	const [files, setFiles] = useState<DiffFile[]>([]);
	const [file, setFile] = useState("");
	const [composerOpen, setComposerOpen] = useState(false);
	// The suggestion threads waiting for one commit, and the threads the
	// commit dialog holds while it is open.
	const [batch, setBatch] = useState<ReadonlySet<string>>(() => new Set());
	const [applying, setApplying] = useState<string[] | null>(null);
	// The diff shows the threads of the revision on screen, plus the threads
	// that name no revision: the CLI wrote those before the pull request had
	// one, and their lines refer to the diff of that time. Region H lists
	// every thread and marks the ones from another revision.
	const everyThread = threads.data?.items ?? noThreads;
	const allThreads = useMemo(
		() => everyThread.filter((thread) => thread.revisionId === null || thread.revisionId === revision?.id),
		[everyThread, revision?.id],
	);
	const threadsById = useMemo(() => new Map(everyThread.map((thread) => [thread.id, thread])), [everyThread]);
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
	// sits on, so region G shows that diff.
	const deepLinkPath = activeThread === null ? undefined : threadsById.get(activeThread)?.path;
	useEffect(() => {
		if (deepLinkPath !== undefined) setFile(deepLinkPath);
	}, [deepLinkPath]);
	// Every fact of regions B, C and E belongs to the commit whose diff the
	// page draws. A summary or an evidence record written for another commit
	// counts as missing, and the notice above the regions asks for a refresh.
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
		base: status.data ? liveBranchState(status.data as LiveBranchMeta) : null,
	});
	// The page reads no run of the ticket, so `turnOf` never answers with the
	// run that works. Its answer is then the word `agent`.
	const turnRow = ticket.data ?? prRow;
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
				{/* Region A. Identity: what the change is, which ticket it
				    answers, and who acts next. It stays above the column, so
				    the controls that end the review are always in reach. */}
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
									{status.data.ticket.identifier}
								</Link>{" "}
								{status.data.ticket.title}
							</p>
						)}
						{turnRow && (
							<TurnLine
								turn={turnOf(turnRow, false)}
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
						{/* Region B. The nine merge conditions. */}
						{conditions && <ConditionsBlock conditions={conditions} />}
						{/* Region C. The summary the agent wrote for this commit. */}
						<ChangeSummary summary={summaryRow} headSha={headSha} />
						{/* Region D. The review focus sentences of the ticket. */}
						{revision && (
							<ReviewFocusList
								pr={pr}
								revisionId={revision.id}
								sentences={ticket.data?.contract.reviewFocus ?? noSentences}
							/>
						)}
						{/* Region E. What the change owes as evidence, and what of it is there. */}
						{floor && <EvidenceStrip records={records} floor={floor} loading={evidence.isPending} />}
						{/* Region F. The GitHub checks, in words. */}
						<ReviewChecks revision={displayRevision} pr={pr} />
						{/* Region G. The changed files by risk, then the diff of the file the reader picked. */}
						{revision === null && !refresh.isError ? (
							<ReviewPageSkeleton />
						) : (
							revision && (
								<>
									<FileRiskGroups pr={pr} repo={ref.repo} files={files} selected={file} onSelect={setFile} />
									<DiffRegion
										pr={pr}
										revision={revision}
										threads={allThreads}
										selectedFile={file}
										renderThread={renderThread}
										onFiles={setFiles}
										onComposer={setComposerOpen}
									/>
								</>
							)
						)}
						{/* Region H. Every thread of the pull request. */}
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
								})();
							}}
						/>
					</div>
				</div>
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
