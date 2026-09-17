import { afterEach, describe, expect, test } from "bun:test";
import { fullZonedDateTime, localClock, localDay, shortDay, shortZonedDateTime } from "./time.ts";

const toronto = { locale: "en-CA", timeZone: "America/Toronto" };
const deviceZone = process.env.TZ;

afterEach(() => {
	process.env.TZ = deviceZone;
});

describe("time", () => {
	test("a named zone moves an instant across the calendar day", () => {
		expect(localDay("2026-01-01T01:30:00.000Z", toronto)).toBe("2025-12-31");
		expect(localClock("2026-01-01T01:30:00.000Z", toronto)).toBe("20:30:00");
		expect(shortDay("2026-01-01T01:30:00.000Z", toronto)).toBe("Dec 31");
		expect(shortZonedDateTime("2026-01-01T01:30:00.000Z", toronto)).toBe("Dec 31, 2025 at 08:30:00 PM EST");
		expect(fullZonedDateTime("2026-01-01T01:30:00.000Z", toronto)).toBe(
			"Wednesday, December 31, 2025 at 8:30:00 PM EST",
		);
	});

	// Toronto skips the hour after 01:59 on 2026-03-08 and repeats the hour
	// after 01:59 on 2026-11-01. The label is the only thing that separates
	// the two 01:30 clocks of the second date.
	test("a daylight-saving change moves the clock and the label", () => {
		expect(localClock("2026-03-08T06:59:00.000Z", toronto)).toBe("01:59:00");
		expect(localClock("2026-03-08T07:01:00.000Z", toronto)).toBe("03:01:00");
		expect(shortZonedDateTime("2026-11-01T05:30:00.000Z", toronto)).toBe("Nov 01, 2026 at 01:30:00 AM EDT");
		expect(shortZonedDateTime("2026-11-01T06:30:00.000Z", toronto)).toBe("Nov 01, 2026 at 01:30:00 AM EST");
	});

	// A reader who takes the device to another zone keeps the page or the
	// process open. The cached formatter must not hold the zone the device
	// had when the first instant was formatted.
	test("a device that changes zone gets the new zone", () => {
		const instant = "2026-01-01T01:30:00.000Z";
		process.env.TZ = "America/Toronto";
		expect(localClock(instant, { locale: "en-CA" })).toBe("20:30:00");
		expect(localDay(instant, { locale: "en-CA" })).toBe("2025-12-31");
		process.env.TZ = "Europe/Berlin";
		expect(localClock(instant, { locale: "en-CA" })).toBe("02:30:00");
		expect(localDay(instant, { locale: "en-CA" })).toBe("2026-01-01");
	});

	test("a device zone change distinguishes zones with equal seasonal offsets", () => {
		const instant = "2026-02-15T12:00:00.000Z";
		process.env.TZ = "Africa/Algiers";
		expect(fullZonedDateTime(instant, { locale: "en-CA" })).toBe("Sunday, February 15, 2026 at 1:00:00 PM GMT+1");
		process.env.TZ = "Africa/Casablanca";
		expect(fullZonedDateTime(instant, { locale: "en-CA" })).toBe("Sunday, February 15, 2026 at 12:00:00 PM GMT+0");
	});
});
