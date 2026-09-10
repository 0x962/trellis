import { eventApplierFor, type Ticket, type TrellisClient } from "@trellis/api";
import { useCallback } from "react";
import { useApp } from "../../../../lib/appContext";

export type WriteOptions = {
	// The row to show while the write is in flight. On failure the row
	// before the write comes back.
	optimistic?: (ticket: Ticket) => Ticket;
};

// One write to the ticket the page shows. The cached detail is keyed by the
// identifier the URL carries. Events for the ticket wait while the write is
// in flight; the response lands first and the held events follow in
// version order, so an optimistic row is never overwritten by an older one.
export const useTicketWrite = (identifier: string) => {
	const { client, orpc, queryClient } = useApp();
	const key = orpc.tickets.get.queryKey({ input: { ticket: identifier } });
	const write = useCallback(
		async (mutate: (client: TrellisClient) => Promise<Ticket>, options: WriteOptions = {}) => {
			const before = queryClient.getQueryData<Ticket>(key)!;
			const applier = eventApplierFor(queryClient);
			if (options.optimistic !== undefined) queryClient.setQueryData(key, options.optimistic(before));
			applier.beginMutation(before.id);
			try {
				const result = await mutate(client);
				applier.endMutation(before.id, result);
				return result;
			} catch (error) {
				if (options.optimistic !== undefined) queryClient.setQueryData(key, before);
				applier.endMutation(before.id);
				throw error;
			}
		},
		[client, queryClient, key],
	);
	return { key, write };
};
