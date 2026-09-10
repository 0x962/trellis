import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { ExternalLink } from "lucide-react";
import { useTicketPrs } from "../../../../hooks/useTicketPrs";

export type ReviewActionsProps = {
	ticket: TicketSummary;
	onApprove: () => void;
	onSendBack: () => void;
};

// What a person does with a ticket that waits on a review. Open PR appears
// for a ticket with an open pull request and opens GitHub in a new tab.
export function ReviewActions({ ticket, onApprove, onSendBack }: ReviewActionsProps) {
	const pr = useTicketPrs(ticket).find((entry) => entry.state === "open");
	return (
		<>
			<Button variant="primary" size="sm" data-approve="" onClick={onApprove}>
				Approve
			</Button>
			<Button size="sm" data-send-back="" onClick={onSendBack}>
				Send back
			</Button>
			{pr !== undefined && (
				<a
					data-open-pr=""
					href={pr.url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-medium text-fg-muted transition duration-hover ease-out hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				>
					<ExternalLink className="size-3.25" aria-hidden="true" />
					Open PR
				</a>
			)}
		</>
	);
}
