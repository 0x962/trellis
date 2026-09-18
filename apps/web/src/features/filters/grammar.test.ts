import { describe, expect, test } from "bun:test";
import { stringifySearchObject } from "../../lib/searchParams";
import { parseSearch, serializeSearch, stripDefaults, toListQuery, viewOf } from "./grammar";

describe("parseSearch", () => {
	test("reads an epic ref and canonicalizes it", () => {
		expect(parseSearch({ epic: "op/Routine-Runtime" }).epic).toBe("OP/routine-runtime");
	});

	test("reads none", () => {
		expect(parseSearch({ epic: "none" }).epic).toBe("none");
	});

	test("drops an invalid epic value", () => {
		expect(parseSearch({ epic: "OP.web" }).epic).toBeUndefined();
	});

	test("reads the epic grouping", () => {
		expect(parseSearch({ group: "epic" }).group).toBe("epic");
	});
});

describe("serializeSearch", () => {
	test("writes epic after parent and before pr", () => {
		const search = serializeSearch(viewOf({ pr: "open", epic: "OP/routine-runtime", parent: "none" }));
		expect(search).toBe("parent=none&epic=OP/routine-runtime&pr=open");
	});

	test("returns the parsed view unchanged", () => {
		const view = parseSearch({ epic: "OP/routine-runtime", group: "epic" });
		expect(parseSearch(Object.fromEntries(new URLSearchParams(serializeSearch(view))))).toEqual(view);
	});

	test("matches the router codec for an epic ref", () => {
		const view = viewOf({ epic: "OP/routine-runtime", status: ["todo", "started"], actor: "human:navid" });
		expect(stringifySearchObject(stripDefaults(view))).toBe(`?${serializeSearch(view)}`);
	});
});

describe("toListQuery", () => {
	test("carries the epic filter", () => {
		expect(toListQuery(viewOf({ epic: "OP/routine-runtime" })).epic).toBe("OP/routine-runtime");
		expect(toListQuery(viewOf({ epic: "none" })).epic).toBe("none");
	});

	test("leaves the epic out when unset", () => {
		expect("epic" in toListQuery(viewOf({}))).toBe(false);
	});
});
