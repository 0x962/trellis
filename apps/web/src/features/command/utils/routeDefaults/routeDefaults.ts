import { projectRefOfPathname } from "../../../../lib/projectPath";
import type { ComposerOptions } from "../../../composer";
import { parseSearch } from "../../../filters/grammar";

// The values a new ticket takes from the view it is created in: the
// project of the route and the first priority the filters hold. A status
// filter only narrows the list, so it does not set the status. The composer
// then uses the project default status.
export const routeDefaults = (pathname: string, search: Record<string, unknown>): ComposerOptions => {
	const view = parseSearch(search);
	const project = projectRefOfPathname(pathname);
	return {
		project: project ?? undefined,
		priority: view.priority?.[0],
	};
};
