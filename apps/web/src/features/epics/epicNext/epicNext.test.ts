import { describe, expect, test } from "bun:test";
import type { AgentRun, Epic, TicketPr, TicketSummary, WaveSummary } from "@trellis/api";
import { currentWaveLabel, epicNext, epicRunningCount, epicWorkingTicketIds } from "./epicNext";

const wave = (slug: string, toStart: number) =>
	({ id: `id-${slug}`, ref: `OP/routine-runtime/${slug}`, name: slug, toStart }) as WaveSummary;

const foundation = wave("foundation", 0);
const surfaces = wave("surfaces", 3);
const link = (entry: WaveSummary) => ({ id: entry.id, ref: entry.ref, name: entry.name });
const statusOf = (category: TicketSummary["status"]["category"]) => ({ category }) as TicketSummary["status"];
const noWaits: TicketSummary["waitsOn"] = [];
const noPrs: TicketSummary["prRows"] = [];
// A ticket that waits for the agent, so a test that counts the tickets of
// the person adds its own rows.
const ticket = (id: string, entry: WaveSummary) =>
	({
		id,
		wave: link(entry),
		status: statusOf("started"),
		waitsOn: noWaits,
		prRows: noPrs,
		ready: false,
	}) as TicketSummary;
// The person reviews this pull request: it is open and it needs no part,
// so `reviewGaps` is empty.
const reviewPr = {
	number: 7,
	state: "open",
	isDraft: false,
	reviewGaps: [],
	fail: 0,
	pending: 0,
	openThreads: 0,
} as unknown as TicketPr;
const question = (id: string, entry: WaveSummary) =>
	({ ...ticket(id, entry), status: statusOf("review") }) as TicketSummary;
const review = (id: string, entry: WaveSummary) => ({ ...ticket(id, entry), prRows: [reviewPr] }) as TicketSummary;
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
	currentWave: link(surfaces),
	waves: [foundation, surfaces],
	tickets: [
		question("foundation", foundation),
		ticket("working-1", surfaces),
		ticket("working-2", surfaces),
		ticket("idle", surfaces),
		question("decision", surfaces),
	],
} as Pick<Epic, "currentWave" | "waves" | "tickets">;

describe("epicNext", () => {
	test("reads the start count from the wave and the supplied running count", () => {
		const next = epicNext(epic, 2, {}, noWorking);

		expect(next?.wave).toBe(surfaces);
		expect(next?.counts.map((count) => count.label)).toEqual(["3 to start", "2 running", "2 wait for you"]);
	});

	test("counts the questions and the pull requests of the epic that wait for the person", () => {
		const waiting = { ...epic, tickets: [...epic.tickets, review("review", surfaces), review("other", foundation)] };

		expect(epicNext(waiting, 2, {}, noWorking)?.counts[2]?.label).toBe("4 wait for you");
	});

	test("drops a ticket whose agent run works from the count of the person", () => {
		const waiting = { ...epic, tickets: [...epic.tickets, review("review", surfaces)] };

		expect(epicNext(waiting, 2, {}, new Set(["review"]))?.counts[2]?.label).toBe("2 wait for you");
	});

	test("links to start inside the wave, groups wait for you by Waiting, and gives running no link", () => {
		const next = epicNext(epic, 2, {}, noWorking);

		expect(next?.counts.map((count) => count.search)).toEqual([
			{ wave: surfaces.ref, category: ["todo"] },
			null,
			{ group: "waiting" },
		]);
	});

	test("keeps the other filters and the display fields, and replaces the status filters", () => {
		const next = epicNext(
			epic,
			2,
			{
				epic: "OP/routine-runtime",
				group: "wave",
				priority: ["high"],
				status: ["in-progress"],
				category: ["started"],
				wave: foundation.ref,
				not: ["status", "priority"],
			},
			noWorking,
		);

		expect(next?.counts[2]?.search).toEqual({
			epic: "OP/routine-runtime",
			priority: ["high"],
			not: ["priority"],
			group: "waiting",
		});
	});

	test("omits the running count and the count of the person until the assigned-run query succeeds", () => {
		expect(epicNext(epic, null, {}, null)?.counts.map((count) => count.label)).toEqual(["3 to start"]);
	});

	test("is null when no wave is current", () => {
		expect(epicNext({ currentWave: null, waves: [foundation], tickets: [] }, 0, {}, noWorking)).toBeNull();
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

	test("counts the tickets of the current wave whose run works", () => {
		expect(epicRunningCount(epic, new Set(["working-1", "working-2", "foundation"]))).toBe(2);
	});
});

describe("currentWaveLabel", () => {
	test("prints the name and the place of the current wave", () => {
		expect(currentWaveLabel({ currentWave: link(surfaces), currentWaveIndex: 2, waveCount: 4 })).toBe(
			"surfaces · 2 of 4",
		);
	});

	test("is null when no wave is current", () => {
		expect(currentWaveLabel({ currentWave: null, currentWaveIndex: null, waveCount: 0 })).toBeNull();
	});
});
