import { expect, test } from "bun:test";
import type { PageSummary } from "@trellis/api";
import {
	isCanonicalPageSearch,
	pageListInput,
	pageRows,
	pageSearchIsFiltered,
	pageSearchQuery,
	parsePageSearch,
} from "./pageSearch";

test("keeps every Page filter from a URL", () => {
	const search = parsePageSearch({
		q: "  release plan  ",
		author: "human:Navid",
		watcher: "01M3APE7QBXVHCKG339JWA3MVK",
		comment: "open",
		pin: "true",
	});

	expect(search).toEqual({
		q: "release plan",
		author: "human:Navid",
		watcher: "01M3APE7QBXVHCKG339JWA3MVK",
		comment: "open",
		pin: true,
	});
	expect(pageListInput("TRL", search, "next")).toEqual({
		project: "TRL",
		q: "release plan",
		author: "human:Navid",
		watcher: "01M3APE7QBXVHCKG339JWA3MVK",
		comment: "open",
		pinned: true,
		cursor: "next",
	});
});

test("drops invalid values and empty search text", () => {
	expect(parsePageSearch({ q: "  ", author: "broken", watcher: "broken", comment: "all", pin: "yes" })).toEqual({});
});

test("writes filters in one canonical order", () => {
	const search = parsePageSearch({ comment: "none", pin: false, q: "release plan", author: "agent:Run" });

	expect(pageSearchQuery(search)).toBe("q=release%20plan&author=agent:Run&comment=none&pin=false");
	expect(isCanonicalPageSearch("?q=release%20plan&author=agent:Run&comment=none&pin=false", search)).toBe(true);
	expect(isCanonicalPageSearch("?pin=false&q=release%20plan&author=agent:Run&comment=none", search)).toBe(false);
});

test("distinguishes the unfiltered list from an empty filter result", () => {
	expect(pageSearchIsFiltered({})).toBe(false);
	expect(pageSearchIsFiltered({ pin: false })).toBe(true);
});

test("keeps the server order across keyset pages", () => {
	const row = (id: string) => ({ id }) as PageSummary;
	const rows = pageRows({
		pages: [
			{ items: [row("pinned"), row("newest")], nextCursor: "next" },
			{ items: [row("older")], nextCursor: null },
		],
	});

	expect(rows.map((page) => page.id)).toEqual(["pinned", "newest", "older"]);
});
