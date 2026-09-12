import type { Ticket } from "@trellis/api";
import { TicketAgent } from "../../agents/TicketAgent";
import { PickerRows } from "./components/PickerRows";

export type PropertiesRailProps = {
	ticket: Ticket;
	// A phone shows the properties under the title.
	variant: "page" | "inline";
};

// The properties of a ticket: the picker rows, then one agent section. That
// section carries the heading, the agent control, and the sessions the
// manager started for this ticket, so the rail names agents once. The
// sub-tickets have their own section beside the description, the branch name
// copies from the header, and the times a ticket was made and last touched
// read as lines of the activity list.
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
			className="min-h-0 w-70 shrink-0 overflow-y-auto rounded-tl-lg border-t border-l border-border px-4 py-3 transition-colors duration-hover ease-out hover:border-border-strong focus-within:border-border-strong motion-reduce:transition-none"
		>
			<dl className="flex flex-col gap-0.5">
				<PickerRows ticket={ticket} />
				{agent}
			</dl>
		</aside>
	);
}
