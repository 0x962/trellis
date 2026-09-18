import { isEpicPathname } from "../../../../lib/projectPath";
import { epicQueryString, keepEpicPageChoices } from "../../../epics/epicSearch";
import { parseSearch, serializeSearch, stripDefaults, viewOf } from "../../../filters/grammar";

// The URL of the current route with `patch` applied to its view. The query
// string keeps the grammar order and writes no default, so a list route
// takes it without a redirect. The epic page has its own defaults: there
// `group=status` is a choice that the URL must carry, and `group=milestone`
// is the default that the URL leaves out, so `epicQueryString` writes the
// query of that route.
export const viewHref = (pathname: string, search: Record<string, unknown>, patch: Record<string, unknown>): string => {
	if (isEpicPathname(pathname)) {
		const raw = { ...search, ...patch };
		return `${pathname}${epicQueryString(keepEpicPageChoices(raw, stripDefaults(parseSearch(raw))))}`;
	}
	const query = serializeSearch(viewOf({ ...parseSearch(search), ...patch }));
	return query === "" ? pathname : `${pathname}?${query}`;
};
