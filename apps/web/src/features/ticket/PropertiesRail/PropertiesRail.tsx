import type { Ticket } from "@trellis/api";
import { TicketAgent } from "../../agents/TicketAgent";
import { AgentsRow } from "./components/AgentsRow";
import { PickerRows } from "./components/PickerRows";

export type PropertiesRailProps = {
	ticket: Ticket;
	// The page draws a 280 px rail; the peek folds the rows into two columns
	// under the title.
	variant: "page" | "peek";
};

// The properties of a ticket: the picker rows, the agent control, and the
// sessions the manager started for this ticket. The sub-tickets have their
// own section beside the description, the branch name copies from the
// header, and the times a ticket was made and last touched read as lines of
// the activity list.
export function PropertiesRail({ ticket, variant }: PropertiesRailProps) {
	const agent = (
		<div className="col-span-full">
			<TicketAgent ticket={ticket.identifier} disabled={ticket.completedAt !== null} />
		</div>
	);
	if (variant === "peek") {
		return (
			<dl aria-label="Properties" className="grid grid-cols-2 gap-x-6 gap-y-1 max-sm:grid-cols-1">
				<PickerRows ticket={ticket} />
				{agent}
				<AgentsRow identifier={ticket.identifier} />
			</dl>
		);
	}
	return (
		<aside
			aria-label="Properties"
			className="h-full w-70 shrink-0 overflow-y-auto border-l border-border bg-surface px-4 py-3"
		>
			<dl className="flex flex-col gap-0.5">
				<PickerRows ticket={ticket} />
				{agent}
				<AgentsRow identifier={ticket.identifier} />
			</dl>
		</aside>
	);
}
