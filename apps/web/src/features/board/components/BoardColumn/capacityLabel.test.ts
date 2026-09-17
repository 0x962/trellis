import { describe, expect, test } from "bun:test";
import { capacityLabel } from "./capacityLabel";

describe("capacityLabel", () => {
	test("names a limited column", () => {
		expect(capacityLabel(3, 29)).toBe("3 of 29 tickets");
	});

	test("names an unlimited column", () => {
		expect(capacityLabel(1, null)).toBe("1 of unlimited tickets");
	});
});
