import { describe, expect, test } from "bun:test";
import type { WaveSummary } from "@trellis/api";
import type { RowGroup } from "../groupRows";
import { doneWaveIds, orderWaveGroups, orderWaves, waveMarks, withEmptyWaves } from "./waveGroups";

const wave = (id: string, state: "open" | "done", done: number, total: number, canceled = 0) =>
	({ id, state, counts: { done, total, canceled } }) as WaveSummary;
const group = (key: string) => ({ key, label: key, rows: [] }) as unknown as RowGroup;

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

describe("orderWaveGroups", () => {
	test("puts open waves first, No wave next, and done waves last", () => {
		const groups = [group("fix"), group("none"), group("foundation"), group("integrate"), group("surfaces")];

		expect(orderWaveGroups(groups, waves).map((entry) => entry.key)).toEqual([
			"surfaces",
			"integrate",
			"none",
			"foundation",
			"fix",
		]);
	});

	test("puts an unknown wave after the open waves and before No wave", () => {
		const groups = [group("fix"), group("none"), group("unknown"), group("integrate"), group("surfaces")];

		expect(orderWaveGroups(groups, waves).map((entry) => entry.key)).toEqual([
			"surfaces",
			"integrate",
			"unknown",
			"none",
			"fix",
		]);
	});
});

describe("orderWaves", () => {
	test("puts open waves before done waves and keeps each position order", () => {
		expect(orderWaves(waves).map((entry) => entry.id)).toEqual(["surfaces", "integrate", "foundation", "fix"]);
	});
});

describe("withEmptyWaves", () => {
	const named = (id: string, total: number) =>
		({ id, ref: `OP/epic/${id}`, name: id, state: "open", counts: { done: 0, total, canceled: 0 } }) as WaveSummary;
	test("adds an empty open wave before No wave", () => {
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
