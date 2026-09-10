import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { ExternalLink, Play } from "lucide-react";
import { useCopyAgentCommand } from "../../../../hooks/useCopyAgentCommand";
import { useTicketPrs } from "../../../../hooks/useTicketPrs";
import { failingChecks } from "../../../../utils/failingChecks";
import { quietLinkClass } from "../../../../utils/quietLinkClass";

// Re-run with agent copies the Start-with-agent command with the names of
// the failed checks inside the brief, so the agent reads what to fix.
export function FailingCiActions({ ticket }: { ticket: TicketSummary }) {
	const prs = useTicketPrs(ticket);
	const pr = prs.find((entry) => entry.state === "open");
	const copy = useCopyAgentCommand();
	return (
		<>
			<Button icon={<Play />} data-rerun="" onClick={() => void copy(ticket.identifier, failingChecks(prs))}>
				Re-run with agent
			</Button>
			{pr !== undefined && (
				<a data-open-pr="" href={pr.url} target="_blank" rel="noreferrer" className={quietLinkClass}>
					<ExternalLink className="size-3" aria-hidden="true" />
					PR #{pr.number}
				</a>
			)}
		</>
	);
}
