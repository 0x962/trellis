import { describe, expect, test } from "bun:test";
import type { WaveSummary } from "@trellis/api";
import { doneWaveIds, waveMarks } from "./waveGroups";

const wave = (id: string, state: "open" | "done", done: number, total: number, canceled = 0) =>
	({ id, state, counts: { done, total, canceled } }) as WaveSummary;

const foundation = wave("foundation", "done", 4, 5, 1);
const surfaces = wave("surfaces", "open", 1, 3);
const integrate = wave("integrate", "open", 0, 2);
const fix = wave("fix", "done", 1, 1);
const waves = [foundation, surfaces, integrate, fix];

describe("waveMarks", () => {
	test("carries only the counts and the done state of each wave", () => {
		const marks = waveMarks(waves);

		expect(marks.get(foundation.id)).toEqual({ countLabel: "4/4", completedCount: 5, totalCount: 5, done: true });
		expect(marks.get(surfaces.id)).toEqual({
			countLabel: "1/3",
			completedCount: 1,
			totalCount: 3,
			done: false,
		});
		expect(marks.get(integrate.id)).toEqual({
			countLabel: "0/2",
			completedCount: 0,
			totalCount: 2,
			done: false,
		});
		expect(marks.get(fix.id)).toEqual({ countLabel: "1/1", completedCount: 1, totalCount: 1, done: true });
	});

	test("prints the counts alone", () => {
		const marks = waveMarks([foundation, fix]);

		expect([...marks.values()]).toEqual([
			{ countLabel: "4/4", completedCount: 5, totalCount: 5, done: true },
			{ countLabel: "1/1", completedCount: 1, totalCount: 1, done: true },
		]);
	});
});

describe("doneWaveIds", () => {
	test("names the done waves, which start collapsed", () => {
		expect(doneWaveIds(waves)).toEqual([foundation.id, fix.id]);
	});
});
