import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { ExternalLink, Play } from "lucide-react";
import { useCopyAgentCommand } from "../../../../hooks/useCopyAgentCommand";
import { useTicketPrs } from "../../../../hooks/useTicketPrs";
import { failingChecks } from "../../../../utils/failingChecks";

// Re-run with agent copies the Start-with-agent command with the failing
// check names appended, so the agent reads what to fix.
export function FailingCiActions({ ticket }: { ticket: TicketSummary }) {
	const prs = useTicketPrs(ticket);
	const pr = prs.find((entry) => entry.state === "open");
	const copy = useCopyAgentCommand();
	return (
		<>
			<Button size="sm" icon={<Play />} data-rerun="" onClick={() => void copy(ticket.identifier, failingChecks(prs))}>
				Re-run with agent
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
					PR #{pr.number}
				</a>
			)}
		</>
	);
}
