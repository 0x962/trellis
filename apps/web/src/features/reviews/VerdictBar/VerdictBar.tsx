import type { AgentRun, ReviewRevision } from "@trellis/api";
import { VerdictButton } from "./components/VerdictButton";

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
	onDone: () => void;
};

// The bar under the review column shows the local review actions.
export function VerdictBar({ pr, revision, ticket, run, drafts, onDone }: VerdictBarProps) {
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			<div className="review-verdict-bar-row">
				<span className="review-verdict-bar-drafts">{commentCount(drafts.length)}</span>
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
		</section>
	);
}
