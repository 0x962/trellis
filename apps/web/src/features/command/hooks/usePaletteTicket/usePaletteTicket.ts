import { useRouterState } from "@tanstack/react-router";
import { contextTicket, useCommandStore } from "../../commandStore";

export const usePaletteTicket = (): string | null => {
	const fromStore = useCommandStore(contextTicket);
	const fromRoute = useRouterState({
		select: (state) => {
			const { pathname } = state.location;
			if (pathname.startsWith("/t/")) return decodeURIComponent(pathname.slice(3));
			return null;
		},
	});
	return fromRoute ?? fromStore;
};
