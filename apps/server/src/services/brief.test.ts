import { expect, test } from "bun:test";
import { assignmentInstruction } from "./brief.ts";

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
