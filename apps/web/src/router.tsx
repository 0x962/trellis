import { createRouter, type RouterHistory } from "@tanstack/react-router";
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
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
	});

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}
