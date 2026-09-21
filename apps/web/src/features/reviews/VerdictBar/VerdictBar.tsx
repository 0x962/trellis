import type { AgentRun, ReviewRevision } from "@trellis/api";
import { MergeButton } from "./components/MergeButton";
import { VerdictButton } from "./components/VerdictButton";
import { unmetLine } from "./unmetLine/unmetLine";

// A merge writes to a company repository, and the page cannot undo it, so the
// person runs it at a computer.
const phoneNoMergeLine = "A merge into an enterprise repository needs the desk.";
const commentCount = (comments: number) => `${comments} ${comments === 1 ? "comment" : "comments"}`;

export type VerdictBarProps = {
	pr: string;
	revision: ReviewRevision;
	// The ticket that links this pull request, or null while no ticket does.
	// A saved verdict needs the ticket to find or start its agent.
	ticket: string | null;
	// The open agent assignment of the ticket, or null while the ticket has
	// none.
	run: AgentRun | null;
	// The open comments that Request changes and Comment deliver to the agent.
	drafts: readonly string[];
	// One phrase per condition that the pull request does not meet, in the
	// words of `conditionLines`.
	unmetConditions: readonly string[];
	phone: boolean;
	showMerge: boolean;
	onDone: () => void;
};

// The bar under the review column shows the comment count and the available
// review actions. `Merge` stays live with any condition unmet, and its line
// names each condition before the person clicks.
export function VerdictBar({
	pr,
	revision,
	ticket,
	run,
	drafts,
	unmetConditions,
	phone,
	showMerge,
	onDone,
}: VerdictBarProps) {
	const meta = revision.meta as { baseRefName?: string };
	const line = showMerge ? (phone ? phoneNoMergeLine : unmetLine(unmetConditions)) : "";
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			<div className="review-verdict-bar-row">
				<span className="review-verdict-bar-drafts">{commentCount(drafts.length)}</span>
				{showMerge && !phone && (
					<MergeButton
						pr={pr}
						revision={revision}
						baseRefName={meta.baseRefName}
						unmetConditions={unmetConditions}
						onDone={onDone}
					/>
				)}
				<VerdictButton
					pr={pr}
					headSha={revision.headSha}
					ticket={ticket}
					run={run}
					drafts={drafts}
					verdict="approve"
					onDone={onDone}
				/>
				<VerdictButton
					pr={pr}
					headSha={revision.headSha}
					ticket={ticket}
					run={run}
					drafts={drafts}
					verdict="request_changes"
					onDone={onDone}
				/>
				<VerdictButton
					pr={pr}
					headSha={revision.headSha}
					ticket={ticket}
					run={run}
					drafts={drafts}
					verdict="comment"
					onDone={onDone}
				/>
			</div>
			{line && <p className="review-verdict-bar-unmet">{line}</p>}
		</section>
	);
}
