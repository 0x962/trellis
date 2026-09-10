import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { ExternalLink } from "lucide-react";
import { useTicketPrs } from "../../../../hooks/useTicketPrs";
import { quietLinkClass } from "../../../../utils/quietLinkClass";

export type ReviewActionsProps = {
	ticket: TicketSummary;
	onApprove: () => void;
	onSendBack: () => void;
};

// What a person does with a ticket that waits on a review. The key caps
// name the keys that do the same on the focused row. Open PR appears for a
// ticket with an open PR and opens GitHub in a new tab.
export function ReviewActions({ ticket, onApprove, onSendBack }: ReviewActionsProps) {
	const pr = useTicketPrs(ticket).find((entry) => entry.state === "open");
	return (
		<>
			<Button variant="primary" kbd="a" data-approve="" onClick={onApprove}>
				Approve
			</Button>
			<Button kbd="r" data-send-back="" onClick={onSendBack}>
				Send back
			</Button>
			{pr !== undefined && (
				<a data-open-pr="" href={pr.url} target="_blank" rel="noreferrer" className={quietLinkClass}>
					<ExternalLink className="size-3" aria-hidden="true" />
					Open PR
				</a>
			)}
		</>
	);
}
