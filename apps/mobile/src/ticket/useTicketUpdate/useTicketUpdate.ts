import { useQueryClient } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { useCallback, useState } from "react";
import { ticketDetailKey } from "../ticketQueries";
import { runTicketUpdate, updateMessage } from "../ticketUpdate";

// The one write path of the ticket screen. `run` shows `optimistic` at once
// and settles the cache from the response. `message` is the text of the
// last rejected write, cleared when the next write starts.
export function useTicketUpdate(identifier: string) {
	const queryClient = useQueryClient();
	const [message, setMessage] = useState<string>();
	const run = useCallback(
		async (optimistic: Ticket, write: () => Promise<Ticket>) => {
			setMessage(undefined);
			try {
				await runTicketUpdate(queryClient, ticketDetailKey(identifier), optimistic, write);
			} catch (error) {
				setMessage(updateMessage(error));
			}
		},
		[queryClient, identifier],
	);
	return { run, message };
}
