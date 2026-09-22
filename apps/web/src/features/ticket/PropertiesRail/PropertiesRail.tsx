import type { Ticket } from "@trellis/api";
import { TicketAgent } from "../../agents/TicketAgent";
import { PickerRows } from "./components/PickerRows";

export type PropertiesRailProps = {
	ticket: Ticket;
	variant: "page" | "inline";
};

// The rail holds fields that change the ticket record, plus the assignment of
// the agent that holds the ticket.
export function PropertiesRail({ ticket, variant }: PropertiesRailProps) {
	const agent = (
		<div className="col-span-full">
			<TicketAgent ticket={ticket.identifier} disabled={ticket.completedAt !== null} />
		</div>
	);
	if (variant === "inline") {
		return (
			<dl aria-label="Properties" className="grid grid-cols-2 gap-x-6 gap-y-1 max-sm:grid-cols-1">
				<PickerRows ticket={ticket} />
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
				{agent}
			</dl>
		</aside>
	);
}
