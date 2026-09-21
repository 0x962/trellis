import { stringifySearchObject } from "../../../lib/searchParams";
import { serializeSearch, stripDefaults, type View, viewDefaults, viewOf } from "../../filters/grammar";

// The fields whose default on the epic page differs from the default of
// every other list route. The epic page lists the tickets of every project
// of the root when the URL names no scope, because an epic belongs to a
// root and holds tickets of any project of that root. When the URL names no
// group, the page groups by milestone 768 px and up, and by turn below:
// on a phone a person answers questions and reads states, and the turn
// groups put those first. The keys stay in the order of `searchParamOrder`.
//
// `phone` is true below 768 px. The same URL can then open with another
// group on a phone, and each device writes the group that differs from its
// own default.
const pageDefaults = (phone: boolean) =>
	({ group: phone ? "turn" : "milestone", scope: "subprojects" }) as const satisfies Partial<View>;
type PageKey = keyof ReturnType<typeof pageDefaults>;
const pageKeys: readonly PageKey[] = ["group", "scope"];

// Writes one page field. The generic key ties the value type to the field,
// which a plain indexed write over the union of the keys does not.
const setField = <K extends PageKey>(target: Partial<View>, key: K, value: View[K]) => {
	target[key] = value;
};

// `stripDefaults` drops `group=status` and `scope=self`, because they are
// the defaults of the list routes. On the epic page each value is a choice:
// without it the page takes its own default. This puts the value back when the raw URL
// params name it, so the `/p/$` route can tell the two cases apart.
export const keepEpicPageChoices = (raw: Record<string, unknown>, search: Partial<View>): Partial<View> => {
	const kept: Partial<View> = { ...search };
	for (const key of pageKeys) if (raw[key] === viewDefaults[key]) setField(kept, key, viewDefaults[key]);
	return kept;
};

// The search of the epic page from the URL search: `epic` is fixed to the
// epic of the page, and a field the URL leaves out takes the page default.
// Every page default is explicit in the result, so `viewOf` and
// `stripDefaults` in the filter bar and the table keep it.
export const epicPageSearch = (search: Partial<View>, epicRef: string, phone = false): Partial<View> => {
	const page: Partial<View> = { ...search, epic: epicRef };
	const defaults = pageDefaults(phone);
	for (const key of pageKeys) setField(page, key, search[key] ?? defaults[key]);
	return page;
};

// The URL search of an epic page search. The URL never carries `epic`,
// because the path names the epic. A page default is never written, and a
// list route default such as `group=status` is written, because it differs
// from the page default.
export const epicUrlSearch = (page: Partial<View>, phone = false): Partial<View> => {
	const { epic, ...rest } = page;
	const url: Partial<View> = stripDefaults(rest);
	const defaults = pageDefaults(phone);
	for (const key of pageKeys) {
		const value = page[key] ?? viewDefaults[key];
		if (value === defaults[key]) delete url[key];
		else setField(url, key, value);
	}
	return url;
};

// The query string of an epic page URL, with the leading `?`, or "" when
// the search holds only page defaults. `search` is a URL search or a page
// search. Every link to an epic page with a search goes through this,
// because `serializeSearch` drops `group=status` and `scope=self`.
export const epicQueryString = (search: Partial<View>, phone = false): string =>
	stringifySearchObject(epicUrlSearch(epicPageSearch(search, "", phone), phone));

// True when the query string of an epic page URL is exactly what
// `epicUrlSearch` writes. `searchStr` is the encoded query string, so an
// ampersand inside a value is `%26` and the split on `&` is safe. The
// params of `pageDefaults` are compared on their own, because
// `serializeSearch` never writes `group=status` or `scope=self`.
export const isCanonicalEpicSearch = (searchStr: string, search: Partial<View>, phone = false): boolean => {
	const expected = epicUrlSearch(epicPageSearch(search, "", phone), phone);
	const parts = searchStr
		.replace(/^\?/, "")
		.split("&")
		.filter((part) => part !== "");
	const isPagePart = (part: string) => pageKeys.some((key) => part.startsWith(`${key}=`));
	const expectedPageParts = pageKeys
		.filter((key) => expected[key] !== undefined)
		.map((key) => `${key}=${expected[key]}`);
	const rest: Partial<View> = { ...expected };
	for (const key of pageKeys) delete rest[key];
	return (
		parts.filter(isPagePart).join("&") === expectedPageParts.join("&") &&
		decodeURIComponent(parts.filter((part) => !isPagePart(part)).join("&")) === serializeSearch(viewOf(rest))
	);
};
