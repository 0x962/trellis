import { expect, test } from "bun:test";
import type { Epic, MilestoneSummary, TicketSummary } from "@trellis/api";
import { assignmentInstruction } from "./brief.ts";
import { epicHeaderLine, epicLines, milestoneHeaderLine, resultsLines } from "./epics/text.ts";

const input = {
	identifier: "OP-27",
	title: "Bound the Operator message post",
	description: "The post waits forever when the thread never answers.\n",
	projectPath: "OP",
	branch: "trellis/op-27-01m2s1scg7ppywezh4b5m8ez4y",
	publicUrl: "http://127.0.0.1:4521",
};

test("an assignment names the ticket, the branch, and the trellis commands", () => {
	expect(assignmentInstruction(input)).toBe(
		[
			"# OP-27: Bound the Operator message post",
			"",
			"- Project: OP",
			"- Branch: trellis/op-27-01m2s1scg7ppywezh4b5m8ez4y",
			"- URL: http://127.0.0.1:4521/t/OP-27",
			"",
			"## Description",
			"",
			"The post waits forever when the thread never answers.",
			"",
			"## Assignment",
			"",
			"Trellis is the ticket tracker on this machine. It assigned this ticket to you. Your worktree is on the branch named above.",
			"Before you start, read the ticket with its comments, its pull requests, and the project notes: trellis brief OP-27",
			"",
			"## Protocol",
			"",
			"Work on the branch named above. Use the trellis CLI to report progress:",
			"",
			"- Start: trellis move OP-27 in-progress",
			'- Ask or report: trellis comment OP-27 --body "..."',
			"- Link each pull request you open: trellis pr add OP-27 <url>",
			'- Split the work: trellis sub OP-27 -t "..."',
			"",
			"Before you ask for a review, link your pull request. The ticket page and the reviewers see only a linked pull request.",
			"",
			"When your work is ready for review, run: trellis move OP-27 agent-review",
			"",
			"## Review comments",
			"",
			"Review comments for a pull request live in Trellis, not on GitHub. GitHub comments are for people.",
			"",
			"- Read the open review comments before you act on review feedback: trellis review list <pr-url>",
			'- Reply to a review comment: trellis review reply <thread-id> --body "..."',
			"- Resolve a review comment you addressed: trellis review resolve <thread-id>",
			'- Post a review comment: trellis review add <pr-url> --path <file> --line <n> --body "..."',
			"",
			"Never post your review comments on GitHub.",
		].join("\n"),
	);
});

test("an assignment skips the description section of a ticket with no description", () => {
	const text = assignmentInstruction({ ...input, description: "  \n" });
	expect(text).not.toContain("## Description");
	expect(text).toContain("- URL: http://127.0.0.1:4521/t/OP-27\n\n## Assignment");
});

// The fields of a ticket row the epic sections read. `milestoneId` is null
// for a ticket outside every milestone. The status `Done` is in the done
// category, and every other status is in the todo category.
const member = (id: string, identifier: string, title: string, status: string, milestoneId: string | null = null) =>
	({
		id,
		identifier,
		title,
		status: { name: status, category: status === "Done" ? "done" : "todo" },
		milestone: milestoneId === null ? null : { id: milestoneId },
	}) as unknown as TicketSummary;

const epic: Epic = {
	id: "01J00000000000000000000010",
	projectId: "01J00000000000000000000001",
	projectPath: "OP",
	ref: "OP/routine-runtime",
	slug: "routine-runtime",
	name: "Routine runtime",
	description: "# Routine runtime\n\nStep 1 creates the runtime.\nStep 2 wires the poller.",
	counts: { total: 4, todo: 1, started: 1, review: 0, done: 1, canceled: 1 },
	state: "open",
	currentMilestone: null,
	currentMilestoneIndex: null,
	milestoneCount: 0,
	actor: { name: "dana", kind: "human" },
	createdAt: "2026-09-18T10:00:00.000Z",
	updatedAt: "2026-09-18T10:00:00.000Z",
	milestones: [],
	tickets: [
		member("01J00000000000000000000029", "OP-29", "Create the runtime", "Done"),
		member("01J00000000000000000000030", "OP-30", "Wire the poller", "In Progress"),
		member("01J00000000000000000000031", "OP-31", "Add the cursor", "Todo"),
		member("01J00000000000000000000032", "OP-32", "Old approach", "Canceled"),
	],
};

test("the epic header line counts done tickets against the tickets that are not canceled", () => {
	expect(epicHeaderLine(epic)).toBe("- Epic: Routine runtime (OP/routine-runtime), 1 of 3 done");
});

test("the epic sections print the plan and every ticket in number order, and mark this ticket", () => {
	expect(epicLines(epic, "01J00000000000000000000030")).toEqual([
		["## Epic: Routine runtime", "", "# Routine runtime\n\nStep 1 creates the runtime.\nStep 2 wires the poller."],
		[
			"## Epic tickets",
			"",
			"- OP-29 Create the runtime (Done)",
			"- OP-30 Wire the poller (In Progress) (this ticket)",
			"- OP-31 Add the cursor (Todo)",
			"- OP-32 Old approach (Canceled)",
		],
	]);
});

const phase = (id: string, slug: string, name: string, position: number): MilestoneSummary => ({
	id,
	epicId: epic.id,
	ref: `OP/routine-runtime/${slug}`,
	slug,
	name,
	position,
	counts: { total: 3, todo: 1, started: 0, review: 0, done: 1, canceled: 1 },
	state: "open",
	toStart: 1,
	waitsForYou: 0,
	createdAt: "2026-09-18T10:00:00.000Z",
	updatedAt: "2026-09-18T10:00:00.000Z",
});

const phase1 = phase("01J00000000000000000000041", "phase-1", "Phase 1: run state", 0);
const phase2 = phase("01J00000000000000000000042", "phase-2", "Phase 2: unattended runs", 1);
const phase3 = phase("01J00000000000000000000043", "phase-3", "Phase 3: proposals", 2);

test("the milestone header line counts done tickets against the tickets that are not canceled", () => {
	expect(milestoneHeaderLine(phase1)).toBe("- Milestone: Phase 1: run state (OP/routine-runtime/phase-1), 1 of 2 done");
});

test("the epic tickets of an epic with milestones group by milestone in position order, then no milestone", () => {
	const grouped: Epic = {
		...epic,
		milestones: [phase1, phase2, phase3],
		tickets: [
			member("01J00000000000000000000029", "OP-29", "Create the runtime", "Done", phase1.id),
			member("01J00000000000000000000030", "OP-30", "Wire the poller", "In Progress", phase2.id),
			member("01J00000000000000000000031", "OP-31", "Add the cursor", "Todo", phase1.id),
			member("01J00000000000000000000032", "OP-32", "Old approach", "Canceled"),
		],
	};
	expect(epicLines(grouped, "01J00000000000000000000031")[1]).toEqual([
		"## Epic tickets",
		"",
		"### Phase 1: run state",
		"",
		"- OP-29 Create the runtime (Done)",
		"- OP-31 Add the cursor (Todo) (this ticket)",
		"",
		"### Phase 2: unattended runs",
		"",
		"- OP-30 Wire the poller (In Progress)",
		"",
		"### Phase 3: proposals",
		"",
		"### No milestone",
		"",
		"- OP-32 Old approach (Canceled)",
	]);
});

test("the results section lists the done tickets of each earlier milestone with the last agent comment", () => {
	const grouped: Epic = {
		...epic,
		milestones: [phase1, phase2, phase3],
		tickets: [
			member("01J00000000000000000000029", "OP-29", "Create the runtime", "Done", phase1.id),
			member("01J00000000000000000000030", "OP-30", "Wire the poller", "Done", phase2.id),
			member("01J00000000000000000000031", "OP-31", "Add the cursor", "Todo", phase1.id),
			member("01J00000000000000000000033", "OP-33", "Write the proposals", "Todo", phase3.id),
			member("01J00000000000000000000034", "OP-34", "Rank the proposals", "Done", phase3.id),
			member("01J00000000000000000000032", "OP-32", "Old approach", "Done"),
		],
	};
	const bodies = new Map([
		["01J00000000000000000000029", "The runtime is in runtime.ts.\n\nRun: bun test runtime"],
		["01J00000000000000000000030", "x".repeat(1300)],
		["01J00000000000000000000034", "A ticket of the same milestone."],
	]);
	expect(resultsLines(grouped, "01J00000000000000000000033", bodies)).toEqual([
		"## Results of earlier milestones",
		"",
		"### Phase 1: run state",
		"",
		"- OP-29 Create the runtime",
		"  The runtime is in runtime.ts.",
		"  ",
		"  Run: bun test runtime",
		"",
		"### Phase 2: unattended runs",
		"",
		"- OP-30 Wire the poller",
		`  ${"x".repeat(1200)}`,
	]);
	expect(resultsLines(grouped, "01J00000000000000000000030", new Map())).toEqual([
		"## Results of earlier milestones",
		"",
		"### Phase 1: run state",
		"",
		"- OP-29 Create the runtime",
	]);
	expect(resultsLines(grouped, "01J00000000000000000000029", bodies)).toEqual([]);
	expect(resultsLines(grouped, "01J00000000000000000000032", bodies)).toEqual([]);
});
