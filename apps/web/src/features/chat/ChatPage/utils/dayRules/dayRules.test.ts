import { describe, expect, test } from "bun:test";
import { dayRules } from "./dayRules";

const toronto = { locale: "en-CA", timeZone: "America/Toronto" };

const at = (id: string, createdAt: string) => ({ id, createdAt });

describe("features/chat/ChatPage/utils/dayRules", () => {
	// Both instants are 2026-01-01 in UTC. In Toronto the first is still
	// 2025-12-31, so the log draws a rule before each of them.
	test("a message across local midnight starts a day", () => {
		const rules = dayRules([at("a", "2026-01-01T01:30:00.000Z"), at("b", "2026-01-01T05:30:00.000Z")], toronto);
		expect(rules.map((rule) => rule.day)).toEqual(["2025-12-31", "2026-01-01"]);
		expect(rules.map((rule) => rule.startsDay)).toEqual([true, true]);
	});

	// The same two instants read as one day in UTC, so the reader's zone
	// decides how many rules the log draws.
	test("the same two instants are one day in UTC", () => {
		const rules = dayRules([at("a", "2026-01-01T01:30:00.000Z"), at("b", "2026-01-01T05:30:00.000Z")], {
			locale: "en-CA",
			timeZone: "UTC",
		});
		expect(rules.map((rule) => rule.day)).toEqual(["2026-01-01", "2026-01-01"]);
		expect(rules.map((rule) => rule.startsDay)).toEqual([true, false]);
	});

	// The daylight-saving change moves the clock and not the calendar day.
	test("a daylight-saving change starts no day", () => {
		const rules = dayRules([at("a", "2026-03-08T06:59:00.000Z"), at("b", "2026-03-08T07:01:00.000Z")], toronto);
		expect(rules.map((rule) => rule.day)).toEqual(["2026-03-08", "2026-03-08"]);
		expect(rules.map((rule) => rule.startsDay)).toEqual([true, false]);
	});

	test("an empty log draws no rule", () => {
		expect(dayRules([], toronto)).toEqual([]);
	});
});
