import { describe, expect, test } from "bun:test";
import type { AgentRun, Epic, MilestoneSummary, TicketSummary } from "@trellis/api";
import { currentMilestoneLabel, epicNext } from "./epicNext";

const milestone = (slug: string, counts: Pick<MilestoneSummary, "toStart" | "waitsForYou">) =>
	({ id: `id-${slug}`, ref: `OP/routine-runtime/${slug}`, name: slug, ...counts }) as MilestoneSummary;

const foundation = milestone("foundation", { toStart: 0, waitsForYou: 0 });
const surfaces = milestone("surfaces", { toStart: 3, waitsForYou: 1 });
const link = (entry: MilestoneSummary) => ({ id: entry.id, ref: entry.ref, name: entry.name });
const ticket = (id: string, entry: MilestoneSummary) => ({ id, milestone: link(entry) }) as TicketSummary;
const run = (ticketId: string, activity: "working" | "idle" = "working", kind: AgentRun["kind"] = "agent") =>
	({
		kind,
		ticketId,
		processStatus: "running",
		observation: { controllable: true, activity: { state: activity }, outcome: null },
	}) as AgentRun;
const epic = {
	currentMilestone: link(surfaces),
	milestones: [foundation, surfaces],
	tickets: [
		ticket("foundation", foundation),
		ticket("working-1", surfaces),
		ticket("working-2", surfaces),
		ticket("idle", surfaces),
	],
} as Pick<Epic, "currentMilestone" | "milestones" | "tickets">;
const runs = [
	run("working-1"),
	run("working-2"),
	run("idle", "idle"),
	run("foundation"),
	run("working-1", "working", "flow"),
];

describe("epicNext", () => {
	test("reads two counts from the milestone and counts its working agent runs", () => {
		const next = epicNext(epic, runs, {});

		expect(next?.milestone).toBe(surfaces);
		expect(next?.counts.map((count) => count.label)).toEqual(["3 to start", "2 running", "1 waits for you"]);
	});

	test("links to start and wait for you inside the milestone, and gives running no link", () => {
		const next = epicNext(epic, runs, {});

		expect(next?.counts.map((count) => count.search)).toEqual([
			{ milestone: surfaces.ref, category: ["todo"] },
			null,
			{ milestone: surfaces.ref, reviewer: "human" },
		]);
	});

	test("keeps the other filters and the display fields, and replaces the status filters", () => {
		const next = epicNext(epic, runs, {
			epic: "OP/routine-runtime",
			group: "milestone",
			priority: ["high"],
			status: ["in-progress"],
			category: ["started"],
			reviewer: "agent",
			milestone: foundation.ref,
			not: ["status", "priority"],
		});

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
		expect(epicNext({ currentMilestone: null, milestones: [foundation], tickets: [] }, runs, {})).toBeNull();
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
