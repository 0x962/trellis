import { expect, test } from "bun:test";
import type { StatisticsLoop } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { LoopBlock } from "./LoopBlock";

const loop: StatisticsLoop = {
	merged: 30,
	oldestMergedAt: "2026-09-12T09:00:00.000Z",
	sentBack: 11,
	withPersonVerdict: 22,
	threadsByPerson: 84,
	threadsByAgent: 212,
	readyToVerdictMs: 7_200_000,
	readyToVerdictMeasured: 18,
	bill: [
		{
			prId: "01M32TW0000000000000PR0001",
			ticket: "TRL-341",
			title: "Wave planner reads the epic contract",
			url: "https://github.com/acme/app/pull/341",
			threadsByPerson: 14,
			sentBack: 2,
			mergedAt: "2026-09-16T09:00:00.000Z",
		},
	],
};

const render = (fields: Partial<StatisticsLoop> = {}) =>
	renderToStaticMarkup(<LoopBlock loop={{ ...loop, ...fields }} />);

test("names each change of the bill with the threads it took", () => {
	const markup = render();

	expect(markup).toContain("TRL-341");
	expect(markup).toContain("Wave planner reads the epic contract");
	expect(markup).toContain("14");
	expect(markup).toContain("3 rounds");
});

test("counts the threads of each author over the window", () => {
	const markup = render();

	expect(markup).toContain("84 of the 296 review threads.");
	expect(markup).toContain("The agents wrote 212.");
});

test("counts the pull requests he sent back and the ones he never read", () => {
	const markup = render();

	expect(markup).toContain("11 of 30.");
	expect(markup).toContain("8 merged with no verdict from you.");
});

test("prints the wait from ready to a verdict with the count it covers", () => {
	const markup = render();

	expect(markup).toContain("2h median.");
	expect(markup).toContain("Over the 18 of 30 that carry both");
});

test("prints no wait while too few pull requests of the window carry both moments", () => {
	expect(render({ readyToVerdictMeasured: 4 })).toContain("Not printed.");
});

test("draws no table while no thread of the window came from a person", () => {
	expect(render({ bill: [] })).not.toContain("<table");
});
