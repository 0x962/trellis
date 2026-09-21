import type { AgentRun, ReviewRevision } from "@trellis/api";
import { CommentOnlyButton } from "./components/CommentOnlyButton";
import { MergeButton } from "./components/MergeButton";
import { SendBackButton } from "./components/SendBackButton";
import { draftCount } from "./sendBackText/sendBackText";
import { unmetLine } from "./unmetLine/unmetLine";

// A merge writes to a company repository, and the page cannot undo it, so the
// person runs it at a computer.
const phoneNoMergeLine = "A merge into an enterprise repository needs the desk.";

export type VerdictBarProps = {
	pr: string;
	revision: ReviewRevision;
	// The ticket that links this pull request, or null while no ticket does.
	// `Send back` needs a ticket to name the agent and to start one, so the
	// bar leaves that control out without one.
	ticket: string | null;
	// The open agent assignment of the ticket, or null while the ticket has
	// none.
	run: AgentRun | null;
	// The threads that `Send back` and `Comment only` carry to GitHub.
	drafts: readonly string[];
	// One phrase per condition that the pull request does not meet, in the
	// words of `conditionLines`.
	unmetConditions: readonly string[];
	phone: boolean;
	showMerge: boolean;
	onDone: () => void;
};

// The bar under the review column shows the draft count and the available
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
				<span className="review-verdict-bar-drafts">{draftCount(drafts.length)}</span>
				{showMerge && !phone && (
					<MergeButton
						pr={pr}
						revision={revision}
						baseRefName={meta.baseRefName}
						unmetConditions={unmetConditions}
						onDone={onDone}
					/>
				)}
				{ticket !== null && (
					<SendBackButton
						pr={pr}
						headSha={revision.headSha}
						ticket={ticket}
						run={run}
						drafts={drafts}
						onDone={onDone}
					/>
				)}
				<CommentOnlyButton pr={pr} headSha={revision.headSha} drafts={drafts} onDone={onDone} />
			</div>
			{line && <p className="review-verdict-bar-unmet">{line}</p>}
		</section>
	);
}
