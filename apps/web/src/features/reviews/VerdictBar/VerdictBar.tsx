import type { AgentRun, ReviewRevision } from "@trellis/api";
import { CommentOnlyButton } from "./components/CommentOnlyButton";
import { MergeButton } from "./components/MergeButton";
import { SendBackButton } from "./components/SendBackButton";
import { draftCount } from "./sendBackText/sendBackText";
import { unmetLine } from "./unmetLine/unmetLine";

// The sentence that stands in place of `Merge` on a phone. A merge writes to
// a company repository, and the page cannot undo it, so the person runs it at
// a computer.
const deskLine = "A merge into an enterprise repository needs the desk.";

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
	// True while the window is narrower than 768 px.
	phone: boolean;
	onDone: () => void;
};

// The bar under the review column: how many drafts wait, and the ways to end
// the review. `Merge` stays live with any condition unmet, and the line under
// the bar names each one, so the person reads what he overrules before he
// clicks. A phone draws `Send back` and `Comment only` and no `Merge`.
export function VerdictBar({ pr, revision, ticket, run, drafts, unmetConditions, phone, onDone }: VerdictBarProps) {
	const meta = revision.meta as { baseRefName?: string };
	// The unmet conditions say why a merge waits. A phone offers no merge, so
	// the bar prints the reason for that in the same place.
	const line = phone ? deskLine : unmetLine(unmetConditions);
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			<div className="review-verdict-bar-row">
				<span className="review-verdict-bar-drafts">{draftCount(drafts.length)}</span>
				{!phone && (
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
