import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { usePeek } from "../../TicketPeek/hooks/usePeek";

// Opens another ticket in the surface the current one uses: the peek moves
// to it when a peek is open, and the full page otherwise. A parent chip,
// a child row, and a search result all open this way.
export const useOpenTicket = () => {
	const navigate = useNavigate();
	const peek = usePeek();
	return useCallback(
		(identifier: string) => {
			if (peek.current !== undefined) {
				peek.open(identifier);
				return;
			}
			void navigate({ to: "/t/$identifier", params: { identifier } });
		},
		[navigate, peek],
	);
};
