import type { TicketSummary } from "@trellis/api";
import { toast, writeClipboard } from "@trellis/ui";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import { branchName } from "../../../../lib/branchName";
import type { CopyKind } from "../useTableHotkeys";

// The copy actions of the table: one ticket's ID, branch, or link, and the
// IDs of a selection one per line. Each copy confirms with a toast whose
// noun matches the count.
export const useCopyTickets = () => {
	const copy = useStableCallback(async (ticket: TicketSummary, kind: CopyKind) => {
		const text =
			kind === "id"
				? ticket.identifier
				: kind === "branch"
					? branchName(ticket.identifier, ticket.title)
					: `${window.location.origin}/t/${ticket.identifier}`;
		await writeClipboard(text);
		toast(`Copied ${text}`);
	});

	const copyIds = useStableCallback(async (tickets: readonly TicketSummary[]) => {
		await writeClipboard(tickets.map((ticket) => ticket.identifier).join("\n"));
		toast(`Copied ${tickets.length} ${tickets.length === 1 ? "ID" : "IDs"}`);
	});

	return { copy, copyIds };
};
