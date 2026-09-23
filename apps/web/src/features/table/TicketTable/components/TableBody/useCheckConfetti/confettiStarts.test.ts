import { describe, expect, test } from "bun:test";
import { allPassed, confettiStarts, type PrChecks } from "./confettiStarts";

const pr = (id: string, counts: Partial<PrChecks> = {}): PrChecks => ({
	id,
	pass: 0,
	fail: 0,
	pending: 0,
	...counts,
});

describe("allPassed", () => {
	test("is true only when a check ran and none failed or waits", () => {
		expect(allPassed(pr("a", { pass: 6 }))).toBe(true);
		expect(allPassed(pr("a", { pass: 6, fail: 1 }))).toBe(false);
		expect(allPassed(pr("a", { pass: 6, pending: 1 }))).toBe(false);
		expect(allPassed(pr("a"))).toBe(false);
	});
});

describe("confettiStarts", () => {
	test("starts nothing for a row the record has never held", () => {
		const first = confettiStarts(new Map(), [pr("a", { pass: 6 })]);
		expect(first.started).toEqual([]);
	});

	test("starts once when the checks turn all-passed, and not again", () => {
		const first = confettiStarts(new Map(), [pr("a", { pass: 3, pending: 3 })]);
		expect(first.started).toEqual([]);

		const second = confettiStarts(first.next, [pr("a", { pass: 6 })]);
		expect(second.started).toEqual(["a"]);

		const third = confettiStarts(second.next, [pr("a", { pass: 6 })]);
		expect(third.started).toEqual([]);
	});

	test("starts nothing for a row that leaves the list and comes back", () => {
		const first = confettiStarts(new Map(), [pr("a", { pass: 6 })]);
		const away = confettiStarts(first.next, []);
		const back = confettiStarts(away.next, [pr("a", { pass: 6 })]);
		expect(back.started).toEqual([]);
	});

	test("starts again after a new push turns the checks back to pending", () => {
		const green = confettiStarts(new Map([["a", false]]), [pr("a", { pass: 6 })]);
		expect(green.started).toEqual(["a"]);

		const pushed = confettiStarts(green.next, [pr("a", { pending: 6 })]);
		expect(pushed.started).toEqual([]);

		const greenAgain = confettiStarts(pushed.next, [pr("a", { pass: 6 })]);
		expect(greenAgain.started).toEqual(["a"]);
	});

	test("names every row that turned all-passed in the same poll", () => {
		const before = new Map([
			["a", false],
			["b", false],
			["c", true],
		]);
		const now = confettiStarts(before, [pr("a", { pass: 2 }), pr("b", { pass: 2 }), pr("c", { pass: 2 })]);
		expect(now.started).toEqual(["a", "b"]);
	});
});
