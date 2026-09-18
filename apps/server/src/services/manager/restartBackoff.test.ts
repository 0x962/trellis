import { expect, test } from "bun:test";
import { BASE_DELAY_MS, MAX_DELAY_MS, restartAllowedAt, restartDelayMs, SHORT_LIFE_MS } from "./restartBackoff.ts";

const now = Date.parse("2026-09-17T05:42:30.000Z");
const second = 1000;

test("a process that ran long enough restarts at once", () => {
	const startedAt = now - SHORT_LIFE_MS - second;
	expect(restartDelayMs({ attemptsAt: [startedAt], startedAt, endedAt: now, now })).toBe(0);
	expect(restartAllowedAt({ attemptsAt: [startedAt], startedAt, endedAt: now, now })).toBe(now);
});

test("the first quick exit waits the base delay from its launch", () => {
	const startedAt = now - 4 * second;
	const input = { attemptsAt: [startedAt], startedAt, endedAt: now, now };
	expect(restartDelayMs(input)).toBe(BASE_DELAY_MS);
	expect(restartAllowedAt(input)).toBe(startedAt + BASE_DELAY_MS);
});

test("the wait doubles with every launch inside the window", () => {
	const startedAt = now - 4 * second;
	const attemptsAt = [startedAt, startedAt - 40 * second, startedAt - 100 * second];
	expect(restartDelayMs({ attemptsAt, startedAt, endedAt: now, now })).toBe(BASE_DELAY_MS * 4);
});

test("the wait stops at the maximum", () => {
	const startedAt = now - 4 * second;
	const attemptsAt = Array.from({ length: 12 }, (_, index) => startedAt - index * 60 * second);
	expect(restartDelayMs({ attemptsAt, startedAt, endedAt: now, now })).toBe(MAX_DELAY_MS);
});

test("a process that still runs with an error counts its life so far", () => {
	const startedAt = now - 10 * second;
	expect(restartDelayMs({ attemptsAt: [startedAt], startedAt, endedAt: null, now })).toBe(BASE_DELAY_MS);
});
