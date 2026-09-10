import { useQuery } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { getOrpc } from "../../../../lib/orpc";
import { InboxRow } from "../InboxRow";

export type FailingCiRowProps = {
	ticket: TicketSummary;
	onPress?: () => void;
};

// A Failing CI row names the failing checks. The names come from the
// ticket's pull requests, which the summary does not carry, so the row
// reads them with its own query. The query is keyed by the ticket ULID, so
// a `pr.updated` event refreshes it.
export function FailingCiRow({ ticket, onPress }: FailingCiRowProps) {
	const prs = useQuery(getOrpc().pullRequests.list.queryOptions({ input: { ticket: ticket.id } }));
	return <InboxRow ticket={ticket} checks={prs.data?.flatMap((pr) => pr.checks)} onPress={onPress} />;
}
