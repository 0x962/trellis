import { describe, expect, test } from "bun:test";
import { emptyLine } from "./emptyLine";

describe("emptyLine", () => {
	// NY-45
	test("uses the singular noun for one ticket", () => {
		expect(emptyLine(1)).toBe("Nothing needs you. 1 ticket in progress by agents.");
	});

	// NY-46. Nothing is in progress, so the second clause says nothing.
	test("drops the second clause at a zero count", () => {
		expect(emptyLine(0)).toBe("Nothing needs you.");
	});

	test("uses the plural noun above one", () => {
		expect(emptyLine(3)).toBe("Nothing needs you. 3 tickets in progress by agents.");
	});
});
