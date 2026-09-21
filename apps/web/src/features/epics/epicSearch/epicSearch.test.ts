import { describe, expect, test } from "bun:test";
import { parseSearch, stripDefaults } from "../../filters/grammar";
import {
	epicPageSearch,
	epicQueryString,
	epicUrlSearch,
	isCanonicalEpicSearch,
	keepEpicPageChoices,
} from "./epicSearch";

// The search the `/p/$` route validates from the raw URL params.
const validated = (raw: Record<string, unknown>) => keepEpicPageChoices(raw, stripDefaults(parseSearch(raw)));

describe("epicSearch", () => {
	test("a URL with no group and no scope gives the page defaults and the fixed epic", () => {
		const page = epicPageSearch(validated({ priority: "high" }), "OP/routine-runtime");
		expect(page).toEqual({
			priority: ["high"],
			epic: "OP/routine-runtime",
			group: "milestone",
			scope: "subprojects",
		});
	});

	test("scope=self stays a choice of the epic page", () => {
		const search = validated({ scope: "self" });
		expect(search).toEqual({ scope: "self" });
		expect(epicPageSearch(search, "OP/routine-runtime").scope).toBe("self");
		expect(epicQueryString(search)).toBe("?scope=self");
		expect(isCanonicalEpicSearch("?group=status&scope=self", validated({ group: "status", scope: "self" }))).toBe(true);
		expect(isCanonicalEpicSearch("?scope=subprojects", validated({ scope: "subprojects" }))).toBe(false);
	});

	test("the query string of a link writes the status group and leaves out the page defaults", () => {
		expect(epicQueryString({ group: "status", scope: "subprojects" })).toBe("?group=status");
		expect(epicQueryString({ group: "milestone", scope: "subprojects", priority: ["high"] })).toBe("?priority=high");
		expect(epicQueryString({})).toBe("");
	});

	test("group=status stays a choice of the epic page", () => {
		const search = validated({ group: "status" });
		expect(search).toEqual({ group: "status" });
		expect(epicPageSearch(search, "OP/routine-runtime").group).toBe("status");
	});

	test("the URL omits the epic and the milestone group, and writes the status group", () => {
		const scope = "subprojects";
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "milestone", scope, sort: "-updatedAt" })).toEqual({});
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "status", scope })).toEqual({ group: "status" });
		// The filter bar strips `group=status` and `scope=self` before it reports a change.
		expect(epicUrlSearch({ epic: "OP/routine-runtime", priority: ["high"] })).toEqual({
			priority: ["high"],
			group: "status",
			scope: "self",
		});
		expect(epicUrlSearch({ group: "priority", scope })).toEqual({ group: "priority" });
	});

	test("the canonical check accepts what epicUrlSearch writes", () => {
		expect(isCanonicalEpicSearch("", validated({}))).toBe(true);
		expect(isCanonicalEpicSearch("?group=status", validated({ group: "status" }))).toBe(true);
		expect(isCanonicalEpicSearch("?q=a%26b&group=status", validated({ q: "a&b", group: "status" }))).toBe(true);
	});

	test("the canonical check refuses a written default and a written epic", () => {
		expect(isCanonicalEpicSearch("?group=milestone", validated({ group: "milestone" }))).toBe(false);
		expect(isCanonicalEpicSearch("?epic=OP/other", validated({ epic: "OP/other" }))).toBe(false);
		expect(isCanonicalEpicSearch("?sort=-updatedAt", validated({ sort: "-updatedAt" }))).toBe(false);
	});
});

describe("epicSearch on a phone", () => {
	const phone = true;

	test("a URL with no group groups by turn", () => {
		expect(epicPageSearch(validated({}), "OP/routine-runtime", phone).group).toBe("turn");
		expect(epicPageSearch(validated({ group: "milestone" }), "OP/routine-runtime", phone).group).toBe("milestone");
	});

	test("the URL omits the turn group and writes the milestone group", () => {
		const scope = "subprojects";
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "turn", scope }, phone)).toEqual({});
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "milestone", scope }, phone)).toEqual({
			group: "milestone",
		});
		expect(epicQueryString({ group: "milestone" }, phone)).toBe("?group=milestone");
	});

	test("the canonical check keeps the milestone group and refuses the turn group", () => {
		expect(isCanonicalEpicSearch("?group=milestone", validated({ group: "milestone" }), phone)).toBe(true);
		expect(isCanonicalEpicSearch("?group=turn", validated({ group: "turn" }), phone)).toBe(false);
	});
});
