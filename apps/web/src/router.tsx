import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { RouteError } from "./features/shell/RouteError";
import type { RouterContext } from "./lib/appContext";
import { parseSearchString, stringifySearchObject } from "./lib/searchParams";
import { routeTree } from "./routeTree.gen";

// One router over the generated tree. Every search param crosses the URL
// in the shared grammar: comma lists, no brackets, no quotes. A route's
// validateSearch turns the raw strings into its typed view.
export const createAppRouter = (context: RouterContext, history?: RouterHistory) =>
	createRouter({
		routeTree,
		context,
		history,
		parseSearch: parseSearchString,
		stringifySearch: stringifySearchObject,
		// A route sees only the search fields its own validateSearch returned, so a
		// default the URL carries is gone after validation and the URL is rewritten.
		search: { strict: true },
		// A route with a pending component shows it after 300 ms of loading,
		// and keeps it 200 ms at least, so a fast load never flashes it.
		defaultPendingMs: 300,
		defaultPendingMinMs: 200,
		// A page whose load failed says why inside the shell.
		defaultErrorComponent: RouteError,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
	});

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}
