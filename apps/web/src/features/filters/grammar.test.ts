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

describe("wave", () => {
	const legacyWaveKey = "milestone";

	test("reads a wave ref and canonicalizes it", () => {
		expect(parseSearch({ wave: "op/Routine-Runtime/Phase-1" }).wave).toBe("OP/routine-runtime/phase-1");
		const view = parseSearch({ [legacyWaveKey]: "OP/routine-runtime/phase-1" });
		expect(view.wave).toBe("OP/routine-runtime/phase-1");
		expect(serializeSearch(view)).toBe("wave=OP/routine-runtime/phase-1");
	});

	test("reads `none`, the value for a ticket outside every wave", () => {
		expect(parseSearch({ wave: "none" }).wave).toBe("none");
	});

	test("drops an epic ref, which has two segments", () => {
		expect(parseSearch({ wave: "OP/routine-runtime" }).wave).toBeUndefined();
	});

	test("reads the wave grouping", () => {
		expect(parseSearch({ group: "wave" }).group).toBe("wave");
		const view = parseSearch({ group: legacyWaveKey });
		expect(view.group).toBe("wave");
		expect(serializeSearch(view)).toBe("group=wave");
	});

	test("reads the turn grouping and writes it back", () => {
		expect(parseSearch({ group: "turn" }).group).toBe("turn");
		expect(serializeSearch(viewOf({ group: "turn" }))).toBe("group=turn");
	});

	test("drops a grouping the grammar does not name", () => {
		expect(parseSearch({ group: "evidence" }).group).toBe("status");
	});

	test("writes wave after epic and before pr", () => {
		const search = serializeSearch(
			viewOf({ pr: "open", wave: "OP/routine-runtime/phase-1", epic: "OP/routine-runtime" }),
		);
		expect(search).toBe("epic=OP/routine-runtime&wave=OP/routine-runtime/phase-1&pr=open");
	});

	test("returns the parsed view unchanged", () => {
		const view = parseSearch({ wave: "OP/routine-runtime/phase-1", group: "wave" });
		expect(parseSearch(Object.fromEntries(new URLSearchParams(serializeSearch(view))))).toEqual(view);
	});

	test("matches the router codec for a wave ref", () => {
		const view = viewOf({ wave: "OP/routine-runtime/phase-1", group: "wave" });
		expect(stringifySearchObject(stripDefaults(view))).toBe(`?${serializeSearch(view)}`);
	});

	test("carries the wave filter in the list query", () => {
		expect(toListQuery(viewOf({ wave: "OP/routine-runtime/phase-1" })).wave).toBe("OP/routine-runtime/phase-1");
		expect(toListQuery(viewOf({ wave: "none" })).wave).toBe("none");
		expect("wave" in toListQuery(viewOf({}))).toBe(false);
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
