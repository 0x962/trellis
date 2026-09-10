import { describe, expect, test } from "bun:test";
import { absoluteTime } from "./absoluteTime";

describe("features/ticket/Timeline/utils/absoluteTime", () => {
	test("gives the date and the time of the instant", () => {
		const iso = "2026-09-09T12:00:00.000Z";
		const expected = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
			new Date(iso),
		);
		expect(absoluteTime(iso)).toBe(expected);
		expect(absoluteTime(iso)).toContain("2026");
	});
});
