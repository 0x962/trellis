import { expect, test } from "bun:test";
import type { Epic, TicketSummary } from "@trellis/api";
import { assignmentInstruction } from "./brief.ts";
import { epicHeaderLine, epicLines } from "./epics/text.ts";

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

// The fields of a ticket row the epic sections read.
const member = (id: string, identifier: string, title: string, status: string) =>
	({ id, identifier, title, status: { name: status } }) as unknown as TicketSummary;

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
	actor: { name: "dana", kind: "human" },
	createdAt: "2026-09-18T10:00:00.000Z",
	updatedAt: "2026-09-18T10:00:00.000Z",
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
