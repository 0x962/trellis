import { useEffect } from "react";
import { useApp } from "../../../../../lib/appContext";

// Runs `onRemoved` when the cached detail of `identifier` leaves the cache.
// A `ticket.deleted` event drops every query that names the ticket, and
// that drop is the signal the peek closes on.
export const useDetailRemoved = (identifier: string | undefined, onRemoved: () => void) => {
	const { queryClient } = useApp();
	useEffect(() => {
		if (identifier === undefined) return;
		return queryClient.getQueryCache().subscribe((event) => {
			const options = event.query.queryKey[1] as { input?: { ticket?: string } } | undefined;
			if (event.type === "removed" && options?.input?.ticket === identifier) onRemoved();
		});
	}, [identifier, onRemoved, queryClient]);
};
