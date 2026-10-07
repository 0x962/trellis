import { describe, expect, test } from "bun:test";
import { isEpicsRetrying } from "./EpicsPage";

describe("epic list retry state", () => {
	test("keeps a retained failure in the retry state during a manual refetch", () => {
		expect(isEpicsRetrying({ isFetching: true, failureCount: 0, error: new Error("Refresh failed") })).toBe(true);
	});

	test("does not report a settled failure as a retry", () => {
		expect(isEpicsRetrying({ isFetching: false, failureCount: 1, error: new Error("Refresh failed") })).toBe(false);
	});
});
