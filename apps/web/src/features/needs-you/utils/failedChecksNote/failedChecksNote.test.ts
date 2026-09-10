import { describe, expect, test } from "bun:test";
import { failedChecksNote } from "./failedChecksNote";

describe("failedChecksNote", () => {
	// NY-32. The names keep the order the checks arrive in.
	test("joins several failed check names with a comma in check order", () => {
		expect(failedChecksNote(["test (node 22)", "lint"])).toBe("Fix the failed checks: test (node 22), lint.");
	});

	test("gives no note when no check failed", () => {
		expect(failedChecksNote([])).toBeUndefined();
	});
});
