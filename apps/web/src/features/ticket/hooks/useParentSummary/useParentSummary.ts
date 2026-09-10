import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";
import type { Orpc } from "../../../../lib/orpc";

// The summary of one ticket by identifier, through the search's `KEY-n`
// short-circuit. A parent chip reads its title here, and a live patch of
// the parent keeps it current without a refetch.
export const summaryOptions = (orpc: Orpc, identifier: string) => ({
	...orpc.search.query.queryOptions({ input: { q: identifier, limit: 1 } }),
	select: (output: { tickets: { title: string; identifier: string }[] }) =>
		output.tickets.find((ticket) => ticket.identifier === identifier),
});

// `undefined` until the summary lands, or when the ticket is gone.
export const useParentSummary = (identifier: string | null) => {
	const { orpc } = useApp();
	const query = useQuery({ ...summaryOptions(orpc, identifier ?? ""), enabled: identifier !== null });
	return query.data;
};
