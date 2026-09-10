import { serializeSearch, type View, viewOf } from "./grammar";

// True when the URL's query string is exactly what the view serializes to:
// no default written, the fields in grammar order. A list route redirects to
// the canonical form when this is false, so `/p/CDE?sort=-updatedAt` becomes
// `/p/CDE`.
export const isCanonicalSearch = (searchStr: string, search: Partial<View>): boolean =>
	searchStr.replace(/^\?/, "") === serializeSearch(viewOf(search));
