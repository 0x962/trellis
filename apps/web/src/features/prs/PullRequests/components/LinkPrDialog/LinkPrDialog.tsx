import type { TicketSummary } from "@trellis/api";
import { Dialog } from "@trellis/ui";
import { useState } from "react";
import { LinkPrField } from "../LinkPrField";

export type LinkPrDialogProps = {
	ticket: TicketSummary;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// The modal that links a pull request URL to the ticket. The modal stays open
// after a link, so the next URL needs no second trip through the plus button.
// Escape and a click outside close it, and the error line clears with it.
export function LinkPrDialog({ ticket, open, onOpenChange }: LinkPrDialogProps) {
	const [error, setError] = useState<string | null>(null);

	const change = (next: boolean) => {
		if (!next) setError(null);
		onOpenChange(next);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={change}
			title="Link a pull request"
			description="Paste the GitHub URL of the pull request."
		>
			<LinkPrField ticket={ticket} onError={setError} />
			{error !== null && (
				<span data-link-error="" role="alert" className="text-sm text-danger">
					{error}
				</span>
			)}
		</Dialog>
	);
}
