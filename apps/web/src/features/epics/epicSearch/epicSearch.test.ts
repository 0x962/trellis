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
	test("a URL with no group gives the page defaults and the fixed epic", () => {
		const page = epicPageSearch(validated({ priority: "high" }), "OP/routine-runtime");
		expect(page).toEqual({
			priority: ["high"],
			epic: "OP/routine-runtime",
			group: "wave",
		});
	});

	test("the query string of a link writes the status group and leaves out the page defaults", () => {
		expect(epicQueryString({ group: "status" })).toBe("?group=status");
		expect(epicQueryString({ group: "wave", priority: ["high"] })).toBe("?priority=high");
		expect(epicQueryString({})).toBe("");
	});

	test("group=status stays a choice of the epic page", () => {
		const search = validated({ group: "status" });
		expect(search).toEqual({ group: "status" });
		expect(epicPageSearch(search, "OP/routine-runtime").group).toBe("status");
	});

	test("the URL omits the epic and the wave group, and writes the status group", () => {
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "wave", sort: "-updatedAt" })).toEqual({});
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "status" })).toEqual({ group: "status" });
		// The filter bar strips `group=status` before it reports a change.
		expect(epicUrlSearch({ epic: "OP/routine-runtime", priority: ["high"] })).toEqual({
			priority: ["high"],
			group: "status",
		});
		expect(epicUrlSearch({ group: "priority" })).toEqual({ group: "priority" });
	});

	test("the canonical check accepts what epicUrlSearch writes", () => {
		expect(isCanonicalEpicSearch("", validated({}))).toBe(true);
		expect(isCanonicalEpicSearch("?group=status", validated({ group: "status" }))).toBe(true);
		expect(isCanonicalEpicSearch("?q=a%26b&group=status", validated({ q: "a&b", group: "status" }))).toBe(true);
	});

	test("the Resources tab stays in the URL, and the Plan tab is the default", () => {
		const search = validated({ tab: "resources", priority: "high" });
		expect(search).toEqual({ tab: "resources", priority: ["high"] });
		expect(epicUrlSearch(epicPageSearch(search, "OP/routine-runtime"))).toEqual(search);
		expect(epicQueryString(search)).toBe("?priority=high&tab=resources");
		expect(isCanonicalEpicSearch("?priority=high&tab=resources", search)).toBe(true);
		expect(validated({ tab: "plan" })).toEqual({});
		expect(isCanonicalEpicSearch("?tab=plan", validated({ tab: "plan" }))).toBe(false);
	});

	test("the canonical check refuses a written default and a written epic", () => {
		expect(isCanonicalEpicSearch("?group=wave", validated({ group: "wave" }))).toBe(false);
		expect(isCanonicalEpicSearch("?epic=OP/other", validated({ epic: "OP/other" }))).toBe(false);
		expect(isCanonicalEpicSearch("?sort=-updatedAt", validated({ sort: "-updatedAt" }))).toBe(false);
	});
});

describe("epicSearch on a phone", () => {
	const phone = true;

	test("a URL with no group groups by wave", () => {
		expect(epicPageSearch(validated({}), "OP/routine-runtime", phone).group).toBe("wave");
		expect(epicPageSearch(validated({ group: "waiting" }), "OP/routine-runtime", phone).group).toBe("waiting");
	});

	test("the URL omits the wave group and writes the Waiting group", () => {
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "wave" }, phone)).toEqual({});
		expect(epicUrlSearch({ epic: "OP/routine-runtime", group: "waiting" }, phone)).toEqual({ group: "waiting" });
	});

	test("the canonical check refuses the wave group and keeps the Waiting group", () => {
		expect(isCanonicalEpicSearch("?group=wave", validated({ group: "wave" }), phone)).toBe(false);
		expect(isCanonicalEpicSearch("?group=waiting", validated({ group: "waiting" }), phone)).toBe(true);
	});
});
