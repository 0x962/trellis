import { useRouterState } from "@tanstack/react-router";
import { ticketRefOfPathname } from "../../../../lib/ticketUrl";
import { contextTicket, useCommandStore } from "../../commandStore";

export const usePaletteTicket = (): string | null => {
	const fromStore = useCommandStore(contextTicket);
	const fromRoute = useRouterState({ select: (state) => ticketRefOfPathname(state.location.pathname) });
	return fromRoute ?? fromStore;
};
