import { describe, expect, test } from "bun:test";
import { selectionOf } from "./useRowSelection";

describe("selectionOf", () => {
	test("the count equals the rows a bulk action writes", () => {
		const view = selectionOf(["a", "b", "c"], new Set(["a", "c"]));

		expect(view.selected).toEqual(["a", "c"]);
		expect(view.count).toBe(2);
	});

	test("a selected row that leaves the view leaves the count", () => {
		const view = selectionOf(["a", "b"], new Set(["a", "b", "gone"]));

		expect(view.selected).toEqual(["a", "b"]);
		expect(view.count).toBe(2);
	});

	test("the rows keep the display order of the view", () => {
		expect(selectionOf(["c", "b", "a"], new Set(["a", "b"])).selected).toEqual(["b", "a"]);
	});

	test("no selected row counts zero", () => {
		expect(selectionOf(["a"], new Set())).toEqual({ selected: [], count: 0 });
	});
});
