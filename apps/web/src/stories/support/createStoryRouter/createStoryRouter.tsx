import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AppContext } from "../../../lib/appContext";
import { parseSearchString, stringifySearchObject } from "../../../lib/searchParams";
import { createAppRouter } from "../../../router";
import type { StoryParameters } from "../types";

export const createStoryRouter = (context: AppContext, parameters: StoryParameters, render: () => ReactNode) => {
	const history = createMemoryHistory({ initialEntries: [parameters.path ?? "/"] });
	if (parameters.generatedRouter) return createAppRouter(context, history);
	const root = createRootRouteWithContext<AppContext>()();
	const path = parameters.routePath ?? "/$";
	if (parameters.route) {
		Object.assign(parameters.route.options, { path, getParentRoute: () => root });
		root.init({ originalIndex: 0 });
		parameters.route.init({ originalIndex: 0 });
	}
	const route = createRoute({
		getParentRoute: () => root,
		path,
		component: render,
		validateSearch: parameters.route?.options.validateSearch ?? ((search) => search),
		...(parameters.loadRoute === false
			? {}
			: {
					loader: parameters.route?.options.loader,
					loaderDeps: parameters.route?.options.loaderDeps,
				}),
	});
	return createRouter({
		routeTree: root.addChildren([route]),
		context,
		history,
		parseSearch: parseSearchString,
		stringifySearch: stringifySearchObject,
		defaultPreload: false,
		defaultPendingMs: 0,
		defaultPendingMinMs: 0,
	});
};
