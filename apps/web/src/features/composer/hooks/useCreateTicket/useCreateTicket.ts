import { useRouter } from "@tanstack/react-router";
import type { Ticket, TicketCreateInput, TicketSummary } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useCallback } from "react";
import { useApp } from "../../../../lib/appContext";
import { insertRow } from "../../../table/utils/cacheRows";

const summaryOf = (ticket: Ticket): TicketSummary => {
	const { description, children, prs, attachments, ...summary } = ticket;
	return summary;
};

// Creates one ticket and tells every surface that lists tickets about it:
// the table rows, the status counts, and the project list. It then shows the
// success toast that opens the new ticket. A create surface reuses this
// sequence instead of repeating it. It throws what `tickets.create` throws,
// so the caller decides what the person sees after a failed create.
export const useCreateTicket = () => {
	const { client, queryClient, orpc } = useApp();
	const router = useRouter();
	return useCallback(
		async (input: TicketCreateInput): Promise<Ticket> => {
			const ticket = await client.tickets.create(input);
			insertRow(queryClient, summaryOf(ticket));
			void queryClient.invalidateQueries({ queryKey: orpc.tickets.counts.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
			const identifier = ticket.identifier;
			toast.success(`Created ${identifier}`, {
				action: { label: "Open", onClick: () => void router.navigate({ href: `/t/${identifier}` }) },
			});
			return ticket;
		},
		[client, orpc, queryClient, router],
	);
};
