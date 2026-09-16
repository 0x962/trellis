import { ORPCError } from "@orpc/client";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { errors, eventApplierFor, type Ticket } from "@trellis/api";

// The row the server holds, from a VERSION_CONFLICT rejection.
const conflictRow = (error: unknown): Ticket | undefined =>
	error instanceof ORPCError && error.defined && error.code === "VERSION_CONFLICT"
		? errors.VERSION_CONFLICT.data.parse(error.data).current
		: undefined;

// One write to a ticket, as the screen runs it. The detail entry under
// `queryKey` shows `optimistic` at once. The event applier holds the
// ticket's stream events while `write` runs, then applies the response
// and the held events in version order. A rejected write puts the entry
// back: the current row from a VERSION_CONFLICT, else the entry from
// before the write. The rejection then reaches the caller.
export const runTicketUpdate = async (
	queryClient: QueryClient,
	queryKey: QueryKey,
	optimistic: Ticket,
	write: () => Promise<Ticket>,
): Promise<Ticket> => {
	const applier = eventApplierFor(queryClient);
	const previous = queryClient.getQueryData<Ticket>(queryKey);
	queryClient.setQueryData(queryKey, optimistic);
	applier.beginMutation(optimistic.id);
	try {
		const result = await write();
		applier.endMutation(optimistic.id, result);
		return result;
	} catch (error) {
		applier.endMutation(optimistic.id);
		queryClient.setQueryData(queryKey, conflictRow(error) ?? previous);
		throw error;
	}
};
