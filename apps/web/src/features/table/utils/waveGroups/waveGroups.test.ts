import { describe, expect, test } from "bun:test";
import type { WaveSummary } from "@trellis/api";
import type { RowGroup } from "../groupRows";
import { doneWaveIds, waveMarks, withEmptyWaves } from "./waveGroups";

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

describe("withEmptyWaves", () => {
	const named = (id: string, total: number) =>
		({ id, ref: `OP/epic/${id}`, name: id, counts: { done: 0, total, canceled: 0 } }) as WaveSummary;
	const group = (key: string) => ({ key, label: key, rows: [] }) as unknown as RowGroup;

	test("adds a group for a wave with no ticket, in wave order, before No wave", () => {
		const groups = withEmptyWaves([group("one"), group("none")], [named("one", 2), named("two", 0)]);

		expect(groups.map((entry) => entry.key)).toEqual(["one", "two", "none"]);
		expect(groups[1]).toEqual({
			key: "two",
			label: "two",
			rows: [],
			wave: { id: "two", ref: "OP/epic/two", name: "two" },
		});
	});

	test("draws every wave of an epic that holds no ticket", () => {
		expect(withEmptyWaves([], [named("one", 0), named("two", 0)]).map((entry) => entry.key)).toEqual(["one", "two"]);
	});

	test("adds no group for a wave whose tickets a filter hides", () => {
		expect(withEmptyWaves([group("none")], [named("one", 3)]).map((entry) => entry.key)).toEqual(["none"]);
	});
});
