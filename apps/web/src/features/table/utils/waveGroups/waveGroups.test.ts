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
	test("marks the current wave, and each open wave after it as Later", () => {
		const marks = waveMarks(waves, surfaces.id);

		expect(marks.get(foundation.id)).toEqual({ countLabel: "4/4", done: true });
		expect(marks.get(surfaces.id)).toEqual({ countLabel: "1/3", badge: "Current", done: false });
		expect(marks.get(integrate.id)).toEqual({ countLabel: "0/2", note: "Later", done: false });
		expect(marks.get(fix.id)).toEqual({ countLabel: "1/1", done: true });
	});

	test("prints the counts alone when no wave is current", () => {
		const marks = waveMarks([foundation, fix], undefined);

		expect([...marks.values()]).toEqual([
			{ countLabel: "4/4", done: true },
			{ countLabel: "1/1", done: true },
		]);
	});
});

describe("doneWaveIds", () => {
	test("names the done waves, which start collapsed", () => {
		expect(doneWaveIds(waves)).toEqual([foundation.id, fix.id]);
	});
});
