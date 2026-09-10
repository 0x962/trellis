import { projectRefOfPathname } from "../../../../lib/projectPath";
import type { ComposerDefaults } from "../../../composer";
import { parseSearch } from "../../../filters/grammar";

// The values a new ticket takes from the view it is created in: the
// project of the route, and the first status and priority the filters
// hold. A ticket made in a filtered view stays in that view.
export const routeDefaults = (pathname: string, search: Record<string, unknown>): ComposerDefaults => {
	const view = parseSearch(search);
	const project = projectRefOfPathname(pathname);
	return {
		project: project ?? undefined,
		status: view.status?.[0],
		priority: view.priority?.[0],
	};
};
