import type { TicketSummary } from "@trellis/api";
import { WaveStartDialog as Dialog } from "@trellis/ui";
import { useState } from "react";
import { type WaveStartAssignment, WaveStartForm } from "./components/WaveStartForm";

export type { WaveStartAssignment } from "./components/WaveStartForm";

export type WaveStartDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	wave: string;
	tickets: readonly TicketSummary[];
	assigned?: ReadonlySet<string>;
	assignment?: WaveStartAssignment;
};

export function WaveStartDialog({ open, onOpenChange, wave, tickets, assigned, assignment }: WaveStartDialogProps) {
	const [starting, setStarting] = useState(false);
	const currentAssignment = assignment ?? { status: "ready" as const, ticketIds: assigned ?? new Set<string>() };
	return (
		<Dialog open={open} onOpenChange={onOpenChange} wave={wave} starting={starting}>
			<WaveStartForm
				wave={wave}
				tickets={tickets}
				assignment={currentAssignment}
				starting={starting}
				onStartingChange={setStarting}
				onClose={() => onOpenChange(false)}
			/>
		</Dialog>
	);
}
