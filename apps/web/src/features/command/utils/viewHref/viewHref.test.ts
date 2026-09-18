import { describe, expect, test } from "bun:test";
import { viewHref } from "./viewHref";

describe("viewHref", () => {
	test("a list route writes no default", () => {
		expect(viewHref("/p/OP/table", { priority: ["high"] }, { group: "status" })).toBe("/p/OP/table?priority=high");
		expect(viewHref("/p/OP/table", {}, { group: "milestone" })).toBe("/p/OP/table?group=milestone");
	});

	test("the epic page writes the status group and leaves out the milestone group", () => {
		expect(viewHref("/p/OP/epics/routine-runtime", {}, { group: "status" })).toBe(
			"/p/OP/epics/routine-runtime?group=status",
		);
		expect(viewHref("/p/OP/epics/routine-runtime", { group: "status" }, { group: "milestone" })).toBe(
			"/p/OP/epics/routine-runtime",
		);
	});

	test("a sort change on the epic page keeps the status group", () => {
		expect(viewHref("/p/OP/epics/routine-runtime", { group: "status" }, { sort: "-priority" })).toBe(
			"/p/OP/epics/routine-runtime?sort=-priority&group=status",
		);
	});
});
