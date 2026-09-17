import { useQueryClient } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { useCallback, useState } from "react";
import { describeError, type ErrorDescription } from "../../lib/describeError";
import { keys, store } from "../../lib/store";
import { ticketDetailKey } from "../ticketQueries";
import { runTicketUpdate } from "../ticketUpdate";

// The one write path of the ticket screen. `run` shows `optimistic` at once
// and settles the cache from the response. `failure` is the title and the
// reason of the last rejected write, cleared when the next write starts.
export function useTicketUpdate(identifier: string) {
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<ErrorDescription>();
	const run = useCallback(
		async (optimistic: Ticket, write: () => Promise<Ticket>) => {
			setFailure(undefined);
			try {
				await runTicketUpdate(queryClient, ticketDetailKey(identifier), optimistic, write);
			} catch (error) {
				setFailure(describeError(error, store.getString(keys.serverUrl)!));
			}
		},
		[queryClient, identifier],
	);
	return { run, failure };
}
