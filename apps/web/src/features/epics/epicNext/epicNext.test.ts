import { describe, expect, test } from "bun:test";
import type { MilestoneSummary } from "@trellis/api";
import { currentMilestoneLabel, epicNext } from "./epicNext";

const milestone = (slug: string, counts: Pick<MilestoneSummary, "toStart" | "running" | "waitsForYou">) =>
	({ id: `id-${slug}`, ref: `OP/routine-runtime/${slug}`, name: slug, ...counts }) as MilestoneSummary;

const foundation = milestone("foundation", { toStart: 0, running: 0, waitsForYou: 0 });
const surfaces = milestone("surfaces", { toStart: 3, running: 2, waitsForYou: 1 });
const link = (entry: MilestoneSummary) => ({ id: entry.id, ref: entry.ref, name: entry.name });

describe("epicNext", () => {
	test("reads the current milestone and its three counts", () => {
		const next = epicNext({ currentMilestone: link(surfaces), milestones: [foundation, surfaces] }, {});

		expect(next?.milestone).toBe(surfaces);
		expect(next?.counts.map((count) => count.label)).toEqual(["3 to start", "2 running", "1 waits for you"]);
	});

	test("links to start and wait for you inside the milestone, and gives running no link", () => {
		const next = epicNext({ currentMilestone: link(surfaces), milestones: [foundation, surfaces] }, {});

		expect(next?.counts.map((count) => count.search)).toEqual([
			{ milestone: surfaces.ref, category: ["todo"] },
			null,
			{ milestone: surfaces.ref, reviewer: "human" },
		]);
	});

	test("keeps the other filters and the display fields, and replaces the status filters", () => {
		const next = epicNext(
			{ currentMilestone: link(surfaces), milestones: [foundation, surfaces] },
			{
				epic: "OP/routine-runtime",
				group: "milestone",
				priority: ["high"],
				status: ["in-progress"],
				category: ["started"],
				reviewer: "agent",
				milestone: foundation.ref,
				not: ["status", "priority"],
			},
		);

		expect(next?.counts[2]?.search).toEqual({
			epic: "OP/routine-runtime",
			group: "milestone",
			priority: ["high"],
			not: ["priority"],
			milestone: surfaces.ref,
			reviewer: "human",
		});
	});

	test("is null when no milestone is current", () => {
		expect(epicNext({ currentMilestone: null, milestones: [foundation] }, {})).toBeNull();
	});
});

describe("currentMilestoneLabel", () => {
	test("prints the name and the place of the current milestone", () => {
		expect(
			currentMilestoneLabel({ currentMilestone: link(surfaces), currentMilestoneIndex: 2, milestoneCount: 4 }),
		).toBe("surfaces · 2 of 4");
	});

	test("is null when no milestone is current", () => {
		expect(
			currentMilestoneLabel({ currentMilestone: null, currentMilestoneIndex: null, milestoneCount: 0 }),
		).toBeNull();
	});
});
