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

describe("parseSearch label", () => {
	test("reads a comma list of label refs", () => {
		expect(parseSearch({ label: "bug,type/feature" }).label).toEqual(["bug", "type/feature"]);
	});

	test("lower-cases a ref and trims the parts of a group ref", () => {
		expect(parseSearch({ label: " Type / Feature " }).label).toEqual(["type/feature"]);
	});

	test("keeps `none`, the value for a ticket with no label", () => {
		expect(parseSearch({ label: "none" }).label).toEqual(["none"]);
	});

	test("a leading bang negates the whole set", () => {
		const view = parseSearch({ label: "!bug,chore" });

		expect(view.label).toEqual(["bug", "chore"]);
		expect(view.not).toEqual(["label"]);
	});

	test("drops the field when no value parses", () => {
		expect(parseSearch({ label: "" }).label).toBeUndefined();
	});
});

describe("serializeSearch label", () => {
	test("writes the refs as a comma list after priority", () => {
		const view = viewOf({ priority: ["high"], label: ["bug", "type/feature"] });

		expect(serializeSearch(view)).toBe("priority=high&label=bug,type/feature");
	});

	test("writes a negated set with a leading bang", () => {
		const view = viewOf({ label: ["bug"], not: ["label"] });

		expect(serializeSearch(view)).toBe("label=!bug");
	});

	test("a parse of its own output returns the same view", () => {
		const view = viewOf({ label: ["bug", "type/feature"], not: ["label"] });

		expect(parseSearch({ label: "!bug,type/feature" })).toEqual(view);
	});
});

describe("toListQuery label", () => {
	test("a positive set goes out as `label`", () => {
		const query = toListQuery(viewOf({ label: ["bug", "type/feature"] }));

		expect(query.label).toEqual(["bug", "type/feature"]);
		expect(query.labelNot).toBeUndefined();
	});

	test("a negated set goes out as `labelNot`, never as the rest of the labels", () => {
		const query = toListQuery(viewOf({ label: ["bug"], not: ["label"] }));

		expect(query.labelNot).toEqual(["bug"]);
		expect(query.label).toBeUndefined();
	});

	test("`none` goes out as it stands", () => {
		expect(toListQuery(viewOf({ label: ["none"] })).label).toEqual(["none"]);
	});

	test("a view with no label field sends neither key", () => {
		const query = toListQuery(viewOf({}));

		expect(query.label).toBeUndefined();
		expect(query.labelNot).toBeUndefined();
	});
});
