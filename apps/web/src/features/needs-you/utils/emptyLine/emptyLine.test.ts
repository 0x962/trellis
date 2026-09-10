import { describe, expect, test } from "bun:test";
import { emptyLine, startedLine } from "./emptyLine";

// The count holds every ticket in a started status, human or agent, so the
// line names no actor.
describe("emptyLine", () => {
	// NY-45
	test("uses the singular noun for one ticket", () => {
		expect(emptyLine(1)).toBe("Nothing needs you. 1 ticket is in progress.");
	});

	// NY-46. Nothing is in progress, so the second clause says nothing.
	test("drops the second clause at a zero count", () => {
		expect(emptyLine(0)).toBe("Nothing needs you.");
	});

	test("uses the plural noun above one", () => {
		expect(emptyLine(3)).toBe("Nothing needs you. 3 tickets are in progress.");
	});
});

// The line under the "Nothing needs you" heading of the empty page.
describe("startedLine", () => {
	test("counts the started tickets with a matching verb", () => {
		expect(startedLine(1)).toBe("1 ticket is in progress.");
		expect(startedLine(3)).toBe("3 tickets are in progress.");
	});

	test("says no ticket is in progress at a zero count", () => {
		expect(startedLine(0)).toBe("No ticket is in progress.");
	});
});
