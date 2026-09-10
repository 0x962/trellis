import { describe, expect, test } from "bun:test";
import { columnWidth } from "./columnWidth";

describe("columnWidth", () => {
	test("the open columns share what the rails and the gaps leave", () => {
		expect(columnWidth(6, 2)).toBe("clamp(248px, calc((100% - 140px) / 4), 300px)");
	});

	test("a board with every column collapsed still divides by one", () => {
		expect(columnWidth(2, 2)).toBe("clamp(248px, calc((100% - 92px) / 1), 300px)");
	});
});
