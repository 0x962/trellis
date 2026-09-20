import { describe, expect, test } from "bun:test";
import type { AgentRun, Epic, MilestoneSummary, TicketPr, TicketSummary } from "@trellis/api";
import { currentMilestoneLabel, epicNext, epicRunningCount, epicWorkingTicketIds } from "./epicNext";

const milestone = (slug: string, toStart: number) =>
	({ id: `id-${slug}`, ref: `OP/routine-runtime/${slug}`, name: slug, toStart }) as MilestoneSummary;

const foundation = milestone("foundation", 0);
const surfaces = milestone("surfaces", 3);
const link = (entry: MilestoneSummary) => ({ id: entry.id, ref: entry.ref, name: entry.name });
const statusOf = (reviewer: TicketSummary["status"]["reviewer"]) =>
	({ category: "started", reviewer }) as TicketSummary["status"];
const noWaits: TicketSummary["waitsOn"] = [];
const noPrs: TicketSummary["prRows"] = [];
// A ticket whose turn is the agent, so a test that counts the tickets of
// the person adds its own rows.
const ticket = (id: string, entry: MilestoneSummary) =>
	({
		id,
		milestone: link(entry),
		status: statusOf(null),
		waitsOn: noWaits,
		prRows: noPrs,
		ready: false,
	}) as TicketSummary;
// The person reviews this pull request: it is open, it is no draft, every
// check passed and no thread is open.
const reviewPr = { number: 7, state: "open", isDraft: false, fail: 0, pending: 0, openThreads: 0 } as TicketPr;
const question = (id: string, entry: MilestoneSummary) =>
	({ ...ticket(id, entry), status: statusOf("human") }) as TicketSummary;
const review = (id: string, entry: MilestoneSummary) => ({ ...ticket(id, entry), prRows: [reviewPr] }) as TicketSummary;
const noWorking: ReadonlySet<string> = new Set();
const run = (ticketId: string, activity: "working" | "idle" = "working", kind: AgentRun["kind"] = "agent") =>
	({
		id: `${kind}-${ticketId}-${activity}`,
		kind,
		ticketId,
		processStatus: "running",
		observation: { controllable: true, activity: { state: activity }, outcome: null },
	}) as AgentRun;
const epic = {
	currentMilestone: link(surfaces),
	milestones: [foundation, surfaces],
	tickets: [
		question("foundation", foundation),
		ticket("working-1", surfaces),
		ticket("working-2", surfaces),
		ticket("idle", surfaces),
		question("decision", surfaces),
	],
} as Pick<Epic, "currentMilestone" | "milestones" | "tickets">;

describe("epicNext", () => {
	test("reads the start count from the milestone and the supplied running count", () => {
		const next = epicNext(epic, 2, {}, noWorking);

		expect(next?.milestone).toBe(surfaces);
		expect(next?.counts.map((count) => count.label)).toEqual(["3 to start", "2 running", "1 waits for you"]);
	});

	test("counts the questions and the pull requests of the milestone that wait for the person", () => {
		const waiting = { ...epic, tickets: [...epic.tickets, review("review", surfaces), review("other", foundation)] };

		expect(epicNext(waiting, 2, {}, noWorking)?.counts[2]?.label).toBe("2 wait for you");
	});

	test("drops a ticket whose agent run works from the count of the person", () => {
		const waiting = { ...epic, tickets: [...epic.tickets, review("review", surfaces)] };

		expect(epicNext(waiting, 2, {}, new Set(["review"]))?.counts[2]?.label).toBe("1 waits for you");
	});

	test("links to start inside the milestone, groups wait for you by turn, and gives running no link", () => {
		const next = epicNext(epic, 2, {}, noWorking);

		expect(next?.counts.map((count) => count.search)).toEqual([
			{ milestone: surfaces.ref, category: ["todo"] },
			null,
			{ milestone: surfaces.ref, group: "turn" },
		]);
	});

	test("keeps the other filters and the display fields, and replaces the status filters", () => {
		const next = epicNext(
			epic,
			2,
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
			noWorking,
		);

		expect(next?.counts[2]?.search).toEqual({
			epic: "OP/routine-runtime",
			priority: ["high"],
			not: ["priority"],
			milestone: surfaces.ref,
			group: "turn",
		});
	});

	test("omits the running count until the assigned-run query succeeds", () => {
		expect(epicNext(epic, null, {}, noWorking)?.counts.map((count) => count.label)).toEqual([
			"3 to start",
			"1 waits for you",
		]);
	});

	test("is null when no milestone is current", () => {
		expect(epicNext({ currentMilestone: null, milestones: [foundation], tickets: [] }, 0, {}, noWorking)).toBeNull();
	});
});

describe("epicRunningCount", () => {
	test("uses only working agent runs as ticket targets", () => {
		expect(
			epicWorkingTicketIds([
				run("working-1"),
				run("working-2"),
				run("idle", "idle"),
				run("working-1", "working", "flow"),
			]),
		).toEqual(["working-1", "working-2"]);
	});

	test("counts working ticket targets in the current milestone once", () => {
		expect(epicRunningCount(epic, ["working-1", "working-2", "foundation"])).toBe(2);
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
