import type { TicketSummary } from "@trellis/api";
import { CircleX } from "lucide-react";
import { useTicketPrs } from "../../../../hooks/useTicketPrs";
import { failingChecks } from "../../../../utils/failingChecks";

// The names of the checks that failed on the ticket's open pull request. The
// mark carries an icon and the names beside the color, so the failure reads
// without color.
export function FailingChecks({ ticket }: { ticket: TicketSummary }) {
	const names = failingChecks(useTicketPrs(ticket));
	if (names.length === 0) return null;
	return (
		<span data-ci-state="fail" className="flex min-w-0 shrink items-center gap-1 text-xs text-danger">
			<CircleX className="size-3 shrink-0" aria-hidden="true" />
			<span className="truncate">{names.join(", ")}</span>
		</span>
	);
}
