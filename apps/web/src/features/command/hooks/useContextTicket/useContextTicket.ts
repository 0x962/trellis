import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

export type ContextTicket = {
	ticket: Ticket | undefined;
	// False while the first read of the ticket in context runs. The palette
	// waits for it, so its first frame already holds the status, the branch
	// name, and one row per pull request.
	ready: boolean;
};

// The ticket the palette acts on. The read starts as soon as a row takes
// the focus, and a ticket the page already read answers from
// the cache. A query that is off never sends its placeholder ref.
export const useContextTicket = (identifier: string | null): ContextTicket => {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.tickets.get.queryOptions({ input: { ticket: identifier ?? "" } }),
		enabled: identifier !== null,
	});
	if (identifier === null) return { ticket: undefined, ready: true };
	return { ticket: query.data, ready: query.isFetched };
};
