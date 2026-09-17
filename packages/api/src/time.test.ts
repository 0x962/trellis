import { afterEach, describe, expect, test } from "bun:test";
import { fullZonedDateTime, shortDay, shortZonedDateTime } from "./time.ts";

const toronto = { locale: "en-CA", timeZone: "America/Toronto" };
const deviceZone = process.env.TZ;

afterEach(() => {
	process.env.TZ = deviceZone;
});

describe("time", () => {
	test("a named zone moves an instant across the calendar day", () => {
		expect(shortDay("2026-01-01T01:30:00.000Z", toronto)).toBe("Dec 31");
		expect(shortZonedDateTime("2026-01-01T01:30:00.000Z", toronto)).toBe("Dec 31, 2025 at 08:30:00 PM EST");
		expect(fullZonedDateTime("2026-01-01T01:30:00.000Z", toronto)).toBe(
			"Wednesday, December 31, 2025 at 8:30:00 PM EST",
		);
	});

	// Toronto repeats the hour after 01:59 on 2026-11-01. The label separates
	// the two 01:30 clocks.
	test("a daylight-saving change moves the clock and the label", () => {
		expect(shortZonedDateTime("2026-11-01T05:30:00.000Z", toronto)).toBe("Nov 01, 2026 at 01:30:00 AM EDT");
		expect(shortZonedDateTime("2026-11-01T06:30:00.000Z", toronto)).toBe("Nov 01, 2026 at 01:30:00 AM EST");
	});

	// A reader who takes the device to another zone keeps the page or the
	// process open. The cached formatter must not hold the zone the device
	// had when the first instant was formatted.
	test("a device that changes zone gets the new zone", () => {
		const instant = "2026-01-01T01:30:00.000Z";
		process.env.TZ = "America/Toronto";
		expect(shortDay(instant, { locale: "en-CA" })).toBe("Dec 31");
		process.env.TZ = "Europe/Berlin";
		expect(shortDay(instant, { locale: "en-CA" })).toBe("Jan 1");
	});

	test("a device zone change distinguishes zones with equal seasonal offsets", () => {
		const instant = "2026-02-15T12:00:00.000Z";
		process.env.TZ = "Africa/Algiers";
		expect(fullZonedDateTime(instant, { locale: "en-CA" })).toBe("Sunday, February 15, 2026 at 1:00:00 PM GMT+1");
		process.env.TZ = "Africa/Casablanca";
		expect(fullZonedDateTime(instant, { locale: "en-CA" })).toBe("Sunday, February 15, 2026 at 12:00:00 PM GMT+0");
	});
});
