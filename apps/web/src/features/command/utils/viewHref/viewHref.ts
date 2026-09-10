import { parseSearch, serializeSearch, viewOf } from "../../../filters/grammar";

// The URL of the current route with `patch` applied to its view. The query
// string keeps the grammar order and writes no default, so a list route
// takes it without a redirect.
export const viewHref = (pathname: string, search: Record<string, unknown>, patch: Record<string, unknown>): string => {
	const query = serializeSearch(viewOf({ ...parseSearch(search), ...patch }));
	return query === "" ? pathname : `${pathname}?${query}`;
};
