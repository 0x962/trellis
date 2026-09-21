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

// The bar under the review column shows the verdict of the person. A
// comment on a diff line reaches the agent on its own, so the bar carries
// no comment control and no waiting count. A verdict on the head commit
// hides Approve and Request changes behind Change verdict.
export function VerdictBar({ pr, revision, ticket, run, submissions, onDone }: VerdictBarProps) {
	const state = verdictState(submissions, revision.headSha);
	// Change verdict opens the buttons for the verdict on screen only. A new
	// submission has another id and closes them again.
	const [changing, setChanging] = useState<string | null>(null);
	const given = state?.current && changing !== state.id ? state : null;
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			{state && <VerdictLine state={state} />}
			<div className="review-verdict-bar-row">
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
			</div>
		</section>
	);
}
