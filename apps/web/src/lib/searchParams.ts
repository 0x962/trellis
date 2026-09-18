// The router's search codec. The URL holds the shared grammar: one param
// per field, comma-separated lists, no brackets and no quotes. A route's
// validateSearch turns these raw strings into its typed view.

export const parseSearchString = (searchStr: string): Record<string, string> =>
	Object.fromEntries(new URLSearchParams(searchStr));

// A comma, a colon, an at sign, and a slash stay readable in the URL. The
// slash separates a group from a label in a label ref such as `type/bug`.
const encode = (value: string) =>
	encodeURIComponent(value).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%40/g, "@").replace(/%2F/g, "/");

export const searchParamOrder = [
	"project",
	"status",
	"category",
	"reviewer",
	"priority",
	"label",
	"parent",
	"pr",
	"ci",
	"actor",
	"q",
	"updated",
	"created",
	"completed",
	"sort",
	"group",
	"closed",
	"scope",
	"density",
	"limit",
] as const;

const positionOf = (key: string) => {
	const index = searchParamOrder.indexOf(key as (typeof searchParamOrder)[number]);
	return index === -1 ? searchParamOrder.length : index;
};

export const stringifySearchObject = (search: Record<string, unknown>): string => {
	const parts: string[] = [];
	const negated = Array.isArray(search.not) ? search.not : [];
	const entries = Object.entries(search).sort(([left], [right]) => positionOf(left) - positionOf(right));
	for (const [key, value] of entries) {
		if (key === "not") continue;
		if (value === undefined || value === null) continue;
		const text = `${negated.includes(key) ? "!" : ""}${Array.isArray(value) ? value.join(",") : String(value)}`;
		if (text === "") continue;
		parts.push(`${encode(key)}=${encode(text)}`);
	}
	return parts.length === 0 ? "" : `?${parts.join("&")}`;
};
