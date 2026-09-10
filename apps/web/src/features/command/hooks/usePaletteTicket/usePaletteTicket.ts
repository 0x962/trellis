import { useRouterState } from "@tanstack/react-router";
import { contextTicket, useCommandStore } from "../../commandStore";

// The ticket the This ticket section acts on. The ticket page names it in
// its path, a peek names it in the `peek` search param, and a list names
// the row that holds the focus. The route wins, because the page on screen
// is the closest context.
export const usePaletteTicket = (): string | null => {
	const fromStore = useCommandStore(contextTicket);
	const fromRoute = useRouterState({
		select: (state) => {
			const { pathname, search } = state.location;
			if (pathname.startsWith("/t/")) return decodeURIComponent(pathname.slice(3));
			const peek = (search as { peek?: unknown }).peek;
			return typeof peek === "string" ? peek : null;
		},
	});
	return fromRoute ?? fromStore;
};
