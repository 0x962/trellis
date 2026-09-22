import { expect, test } from "bun:test";
import { checkDuration } from "./checkDuration";

test("a check under one minute reads in seconds", () => {
	expect(checkDuration("2026-09-21T10:00:00Z", "2026-09-21T10:00:42Z")).toBe("42s");
	expect(checkDuration("2026-09-21T10:00:00Z", "2026-09-21T10:00:00Z")).toBe("0s");
});

test("a longer check reads in minutes and hours", () => {
	expect(checkDuration("2026-09-21T10:00:00Z", "2026-09-21T10:02:14Z")).toBe("2m 14s");
	expect(checkDuration("2026-09-21T10:00:00Z", "2026-09-21T11:05:00Z")).toBe("1h 5m");
});

test("a check with no end, no start, or an end before its start reads nothing", () => {
	expect(checkDuration("2026-09-21T10:00:00Z", null)).toBe("");
	expect(checkDuration(null, "2026-09-21T10:00:00Z")).toBe("");
	expect(checkDuration("2026-09-21T10:02:00Z", "2026-09-21T10:00:00Z")).toBe("");
	expect(checkDuration("not a time", "2026-09-21T10:00:00Z")).toBe("");
});
