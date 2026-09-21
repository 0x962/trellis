import { describe, expect, test } from "bun:test";
import type { EpicCounts } from "../schemas/epicCounts.ts";
import type { WaveSummary } from "../schemas/wave.ts";
import { epicBandLine, epicCountLine, epicWaveHeading } from "./epicText.ts";

const counts = (fields: Partial<EpicCounts> = {}): EpicCounts => ({
	total: 0,
	todo: 0,
	started: 0,
	review: 0,
	done: 0,
	canceled: 0,
	...fields,
});

const wave = (fields: Partial<WaveSummary> = {}): WaveSummary =>
	({
		name: "The run settles, and its state reaches the page",
		ref: "OP/routines-e2e/run-settles",
		counts: counts({ total: 6, todo: 6 }),
		toStart: 0,
		waitsForYou: 0,
		...fields,
	}) as WaveSummary;

describe("epicBandLine", () => {
	test("prints the done count and each status with its count", () => {
		expect(epicBandLine(counts({ total: 27, todo: 15, review: 9, done: 3 }))).toBe(
			"3 of 27 done · done 3 · review 9 · started 0 · todo 15 · canceled 0",
		);
	});

	test("leaves a canceled ticket out of the total", () => {
		expect(epicBandLine(counts({ total: 4, done: 1, canceled: 1, todo: 2 }))).toBe(
			"1 of 3 done · done 1 · review 0 · started 0 · todo 2 · canceled 1",
		);
	});
});

describe("epicCountLine", () => {
	test("counts what starts and what waits for the person", () => {
		expect(epicCountLine({ toStart: 0, waitsForYou: 4 })).toBe("0 to start · 4 wait for you");
	});

	test("says waits for one ticket", () => {
		expect(epicCountLine({ toStart: 2, waitsForYou: 1 })).toBe("2 to start · 1 waits for you");
	});
});

describe("epicWaveHeading", () => {
	test("marks the current wave and counts the tickets that wait for the person", () => {
		expect(epicWaveHeading(wave({ waitsForYou: 1 }), true)).toBe(
			"The run settles, and its state reaches the page (OP/routines-e2e/run-settles)  current  0 of 6 · 1 for you",
		);
	});

	test("prints the done count alone for a wave that waits for nobody", () => {
		expect(epicWaveHeading(wave({ counts: counts({ total: 3, done: 3 }) }), false)).toBe(
			"The run settles, and its state reaches the page (OP/routines-e2e/run-settles)  3 of 3",
		);
	});
});
