import { Link } from "@tanstack/react-router";
import { startReason } from "../utils/startReason";

export type AgentFailureProps = {
	// The failed session, for the anchor the Agents page carries.
	id: string;
	// What the runner said, as the server stored it.
	error: string | null;
	// The words before the reason, in the same sentence.
	lead?: string;
};

// Why one agent did not start, in one line, and the link to its full error
// on the Agents page. The reason is the runner's own words, so a person
// reads what to fix.
export function AgentFailure({ id, error, lead = "" }: AgentFailureProps) {
	return (
		<>
			<span className="min-w-0 truncate text-sm text-danger">{`${lead}${startReason(error)}`}</span>
			<Link
				to="/agents"
				hash={id}
				className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-1.5 text-sm font-medium text-fg-muted transition duration-hover ease-out hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:h-11"
			>
				Details
			</Link>
		</>
	);
}
