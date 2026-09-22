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
	onDone: () => void;
};

// The card that floats over the bottom right of the review shows the verdict
// of the person on one line. A comment on a diff line reaches the agent when
// the person posts it, so the card holds the two verdicts only.
export function VerdictBar({ pr, revision, ticket, run, submissions, onDone }: VerdictBarProps) {
	const state = verdictState(submissions);
	// Change verdict opens the buttons for the verdict on screen only. A new
	// submission has another id and closes them again.
	const [changing, setChanging] = useState<string | null>(null);
	const given = state?.current && changing !== state.id ? state : null;
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			<div className="review-bar-words">{state && <VerdictLine state={state} />}</div>
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
