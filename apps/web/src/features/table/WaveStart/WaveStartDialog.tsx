import type { TicketSummary } from "@trellis/api";
import { WaveStartDialog as Dialog } from "@trellis/ui";
import { useState } from "react";
import { WaveStartForm } from "./components/WaveStartForm";

export type WaveStartDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	wave: string;
	tickets: readonly TicketSummary[];
	assigned: ReadonlySet<string>;
};

export function WaveStartDialog({ open, onOpenChange, wave, tickets, assigned }: WaveStartDialogProps) {
	const [starting, setStarting] = useState(false);
	return (
		<Dialog open={open} onOpenChange={onOpenChange} wave={wave} starting={starting}>
			<WaveStartForm
				wave={wave}
				tickets={tickets}
				assigned={assigned}
				starting={starting}
				onStartingChange={setStarting}
				onClose={() => onOpenChange(false)}
			/>
		</Dialog>
	);
}
