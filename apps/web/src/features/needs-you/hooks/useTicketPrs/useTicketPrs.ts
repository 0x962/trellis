import { useQuery } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

// The pull requests linked to one ticket. A summary carries the badge counts
// only, so the check names and the pull request URL come from here. A ticket
// with no badge has no pull request, so the read is skipped.
export const useTicketPrs = (ticket: TicketSummary) => {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.identifier } }),
		enabled: ticket.pr !== null,
	});
	return query.data ?? [];
};
