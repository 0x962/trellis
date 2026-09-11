import type { TicketSummary } from "@trellis/api";
import { ExternalLink } from "lucide-react";
import { useTicketPrs } from "../../../../hooks/useTicketPrs";
import { quietLinkClass } from "../../../../utils/quietLinkClass";

export function FailingCiActions({ ticket }: { ticket: TicketSummary }) {
	const prs = useTicketPrs(ticket);
	const pr = prs.find((entry) => entry.state === "open");
	return (
		<>
			{pr !== undefined && (
				<a data-open-pr="" href={pr.url} target="_blank" rel="noreferrer" className={quietLinkClass}>
					<ExternalLink className="size-3" aria-hidden="true" />
					PR #{pr.number}
				</a>
			)}
		</>
	);
}
