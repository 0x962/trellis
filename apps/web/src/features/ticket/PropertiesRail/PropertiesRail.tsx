import type { Ticket } from "@trellis/api";
import { TicketAgent } from "../../agents/TicketAgent";
import { RunBlock } from "../RunBlock";
import { PickerRows } from "./components/PickerRows";
import { PullRequestsRow } from "./components/PullRequestsRow";

export type PropertiesRailProps = {
	ticket: Ticket;
	variant: "page" | "inline";
};

// Every property of the ticket, and every control that acts on it: the
// pickers, the pull requests, the agent that holds the ticket, and the run
// that agent started. The page beside the rail holds the words of the ticket
// alone.
export function PropertiesRail({ ticket, variant }: PropertiesRailProps) {
	const agent = (
		<div className="col-span-full flex min-w-0 flex-col gap-2">
			<TicketAgent ticket={ticket.identifier} disabled={ticket.completedAt !== null} />
			<RunBlock key={ticket.id} ticket={ticket} />
		</div>
	);
	if (variant === "inline") {
		return (
			<dl aria-label="Properties" className="grid grid-cols-2 gap-x-6 gap-y-1 max-sm:grid-cols-1">
				<PickerRows ticket={ticket} />
				<PullRequestsRow ticket={ticket} />
				{agent}
			</dl>
		);
	}
	return (
		<aside
			aria-label="Properties"
			className="min-h-0 w-70 shrink-0 overflow-y-auto page-card border-l border-border px-4 py-3"
		>
			<dl className="flex flex-col gap-0.5">
				<PickerRows ticket={ticket} />
				<PullRequestsRow ticket={ticket} />
				{agent}
			</dl>
		</aside>
	);
}
