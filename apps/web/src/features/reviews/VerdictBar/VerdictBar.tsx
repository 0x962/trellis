import { PencilSimple } from "@phosphor-icons/react";
import type { AgentRun, ReviewRevision, ReviewSubmission } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { VerdictButton } from "./components/VerdictButton";
import { VerdictLine } from "./components/VerdictLine";
import { verdictState } from "./verdictState/verdictState";

export type VerdictBarProps = {
	pr: string;
	revision: ReviewRevision;
	// The ticket that links this pull request, or null while no ticket does.
	// A saved verdict needs the ticket to find or start its agent.
	ticket: string | null;
	// The open agent assignment of the ticket, or null while the ticket has
	// none.
	run: AgentRun | null;
	// The local submissions on this pull request, from `reviews.submissions`.
	submissions: readonly ReviewSubmission[];
	// False while the `reviews.submissions` read is still on its way. The
	// card draws nothing until it answers. A card drawn before the answer
	// offers Approve and Request changes, and a verdict the person already
	// gave replaces both with Change verdict a moment later, under a pointer
	// that was on its way to Request changes.
	submissionsFetched: boolean;
	onDone: () => void;
};

// The card that floats over the bottom right of the review shows the verdict
// of the person on one line. A comment on a diff line reaches the agent when
// the person posts it, so the card holds the two verdicts only.
export function VerdictBar({ pr, revision, ticket, run, submissions, submissionsFetched, onDone }: VerdictBarProps) {
	const state = verdictState(submissions);
	// Change verdict opens the buttons for the verdict on screen only. A new
	// submission has another id and closes them again.
	const [changing, setChanging] = useState<string | null>(null);
	const given = state?.current && changing !== state.id ? state : null;
	if (!submissionsFetched) return null;
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			{state && (
				<div className="review-bar-words">
					<VerdictLine state={state} />
				</div>
			)}
			{given === null ? (
				<>
					<VerdictButton
						pr={pr}
						headSha={revision.headSha}
						ticket={ticket}
						run={run}
						verdict="approve"
						onDone={onDone}
					/>
					<VerdictButton
						pr={pr}
						headSha={revision.headSha}
						ticket={ticket}
						run={run}
						verdict="request_changes"
						onDone={onDone}
					/>
				</>
			) : (
				<Tooltip content="Change verdict">
					<IconButton label="Change verdict" icon={<PencilSimple />} onClick={() => setChanging(given.id)} />
				</Tooltip>
			)}
		</section>
	);
}
