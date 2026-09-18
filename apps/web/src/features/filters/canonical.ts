import { serializeSearch, type View, viewOf } from "./grammar";

// True when the URL's query string is exactly what the view serializes to:
// no default written, the fields in grammar order. A list route redirects to
// the canonical form when this is false, so `/p/CDE?sort=-updatedAt` becomes
// `/p/CDE`. The router writes a space as `%20` and a slash as `%2F`, and
// `serializeSearch` writes the characters themselves, so the URL is decoded
// before the comparison. Without that, `?q=hello%20world` redirects to itself
// without end.
export const isCanonicalSearch = (searchStr: string, search: Partial<View>): boolean =>
	decodeURIComponent(searchStr.replace(/^\?/, "")) === serializeSearch(viewOf(search));
