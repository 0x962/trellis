import { expect, test } from "bun:test";
import { parseSnooze } from "./parseSnooze";

const now = new Date(2026, 0, 31, 12, 0, 0);
test("duration aliases include suffixes, prefixes, spaces, and calendar units", () => {
	for (const text of ["1d", "1 day", "d1", "day1", "day 1"])
		expect(parseSnooze(text, now).date).toEqual(new Date(2026, 1, 1, 12));
	for (const text of ["1 month", "1mnth", "mnth1", "m1"])
		expect(parseSnooze(text, now).date).toEqual(new Date(2026, 1, 28, 12));
	expect(parseSnooze("5m", now).date?.getTime()).toBe(now.getTime() + 300000);
	expect(parseSnooze("23h", now).date?.getTime()).toBe(now.getTime() + 23 * 3600000);
	expect(parseSnooze("1y", now).date).toEqual(new Date(2027, 0, 31, 12));
	expect(parseSnooze("1 day 2 hours", now).date).toEqual(new Date(2026, 1, 1, 14));
});
test("natural language uses local dates and previews past dates without accepting them", () => {
	expect(parseSnooze("today", now).date).toEqual(new Date(2026, 0, 31, 23, 59));
	expect(parseSnooze("tomorrow", now).date).toEqual(new Date(2026, 1, 1, 9));
	expect(parseSnooze("next week", now).date).toEqual(new Date(2026, 1, 2, 9));
	expect(parseSnooze("yesterday", now).error).toBe("Choose a future time.");
	expect(parseSnooze("February 10 2026 at 3pm", now).date).toEqual(new Date(2026, 1, 10, 15));
});
test("invalid or partial input cannot snooze", () => {
	for (const text of ["", "nonsense", "0m", "-1d", "1d junk", "tomorrow garbage", "999999999999999999y"])
		expect(parseSnooze(text, now).error).toBeTruthy();
});
