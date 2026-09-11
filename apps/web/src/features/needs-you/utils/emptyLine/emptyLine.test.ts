import { describe, expect, test } from "bun:test";
import { startedLine } from "./emptyLine";

// The count holds every ticket in a started status, human or agent, so the
// line names no actor.
describe("features/needs-you/utils/emptyLine", () => {
	// TRL-27
	test("counts the started tickets with a matching verb", () => {
		expect(startedLine(1)).toBe("1 ticket is in progress.");
		expect(startedLine(3)).toBe("3 tickets are in progress.");
	});

	test("says no ticket is in progress at a zero count", () => {
		expect(startedLine(0)).toBe("No ticket is in progress.");
	});

	test("groups the digits above a thousand", () => {
		expect(startedLine(1200)).toBe("1,200 tickets are in progress.");
	});
});
