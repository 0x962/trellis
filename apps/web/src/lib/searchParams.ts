// The router's search codec. The URL holds the shared grammar: one param
// per field, comma-separated lists, no brackets and no quotes. A route's
// validateSearch turns these raw strings into its typed view.

export const parseSearchString = (searchStr: string): Record<string, string> =>
	Object.fromEntries(new URLSearchParams(searchStr));

// A comma, a colon, and an at sign stay readable in the URL.
const encode = (value: string) =>
	encodeURIComponent(value).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%40/g, "@");

export const stringifySearchObject = (search: Record<string, unknown>): string => {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined || value === null) continue;
		const text = Array.isArray(value) ? value.join(",") : String(value);
		if (text === "") continue;
		parts.push(`${encode(key)}=${encode(text)}`);
	}
	return parts.length === 0 ? "" : `?${parts.join("&")}`;
};
