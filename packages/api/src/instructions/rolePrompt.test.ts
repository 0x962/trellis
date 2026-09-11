import { describe, expect, test } from "bun:test";
import * as api from "../index.ts";
import { rolePrompt } from "./rolePrompt.ts";

const pr = "https://github.com/o/r/pull/7";

const statuses = [
	{ name: "Todo", slug: "todo", category: "todo", reviewer: null, description: "New work. Start a builder." },
	{ name: "In Progress", slug: "in-progress", category: "started", reviewer: null, description: "" },
	{
		name: "Deploy Queue",
		slug: "deploy-queue",
		category: "started",
		reviewer: null,
		description: "Deploy every ticket here, then wait for a human.",
	},
	{ name: "Human Review", slug: "human-review", category: "review", reviewer: "human", description: "Do nothing." },
] as const;

const manager = rolePrompt({ role: "manager", project: "CDE", statuses: [...statuses] });
const builder = rolePrompt({ role: "builder", project: "CDE", ticket: "CDE-42" });
const reviewer = rolePrompt({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl: pr });

const expectFragments = (text: string, fragments: string[]) => {
	for (const fragment of fragments) expect(text, fragment).toContain(fragment);
};

describe("the manager prompt", () => {
	test("reads the inbox after every wake and registers its session", () => {
		expectFragments(manager, [
			"agent:manager-cde",
			"trellis agents register --role manager --project CDE",
			"After every wake, read the inbox: trellis agents inbox --project CDE --json",
			'Run it again while "more" is true.',
		]);
	});

	test("lists every status with its description as the rule for that status", () => {
		expectFragments(manager, [
			"trellis statuses list CDE --json",
			"- Todo (todo): New work. Start a builder.",
			"- In Progress (in-progress): (no description)",
			"- Deploy Queue (deploy-queue): Deploy every ticket here, then wait for a human.",
			"- Human Review (human-review): Do nothing.",
			"Follow the description of a status as the rule for every ticket in that status.",
		]);
	});

	test("without statuses it tells the manager to read them and lists none", () => {
		const bare = rolePrompt({ role: "manager", project: "KEY", statuses: null });
		expect(bare).toContain("trellis statuses list KEY --json");
		expect(bare).not.toContain("(no description)");
	});

	test("starts builders up to the limit, queues once, and never starts a second builder", () => {
		expectFragments(manager, [
			"trellis agents start <ticket>",
			"trellis agents status --ticket <ticket> --json",
			"Never start a second builder for a ticket that has one.",
			"CONCURRENCY_LIMIT",
			'comment "Queued: <n> builders are running." once',
		]);
	});

	// The heartbeat types PING on the project's interval, so the manager
	// gets a turn while nothing changes. The five steps run in this order,
	// and a manager with nothing to do writes nothing.
	test("a PING runs the five checks in order and writes nothing when everything is in order", () => {
		expectFragments(manager, [
			'A message that is only "PING" is a heartbeat.',
			"1. Read the inbox: trellis agents inbox --project CDE --json",
			"2. List your agents: trellis agents status --project CDE --json",
			"3. Restart or clean up an agent that died, and comment on its ticket when you do.",
			"4. Read every ticket in a status whose description tells you to act, and act.",
			"5. Answer nothing and write nothing when everything is in order.",
			"several PINGs can arrive together. Run the five steps one time for all of them.",
		]);
	});

	test("comments on every transition and starts a reviewer at Agent Review", () => {
		expectFragments(manager, [
			"Comment on the ticket at every transition you make, so the human knows what happens.",
			"trellis comment <ticket> --body",
			"trellis agents review <ticket> --pr <pr-url>",
		]);
	});

	test("forwards findings and send-back comments to the builder with their text", () => {
		expectFragments(manager, [
			"superset terminals send --workspace <workspaceId> --terminal <terminalId> --text",
			"Verdict: changes needed",
			"send-back",
			"trellis move <ticket> in-progress",
		]);
	});

	test("moves to Human Review only on a PR, a clean review, and passing CI, and never to Done", () => {
		expectFragments(manager, [
			"Move a ticket to Human Review only when the PR exists, the last verdict is clean, and CI passes.",
			"Verdict: clean",
			"trellis pr list <ticket> --json",
			"Never move a ticket to Done; a human does that.",
			"Never delete a ticket or a project.",
		]);
	});
});

describe("the builder prompt", () => {
	test("makes a PR the deliverable on a branch that holds the ticket id", () => {
		expectFragments(builder, [
			"agent:builder-cde-42",
			"Your deliverable is a pull request.",
			"cde-42",
			"trellis agents register --role builder --project CDE --ticket CDE-42",
			"trellis show CDE-42 --comments",
		]);
	});

	test("comments at milestones and moves to Agent Review when the PR is open", () => {
		expectFragments(builder, ["trellis comment CDE-42 --body", "trellis move CDE-42 agent-review"]);
	});

	test("answers forwarded comments on the same PR and never completes or deletes", () => {
		expectFragments(builder, [
			"push to the same branch and the same PR",
			"Never open a second PR for this ticket.",
			"Never move a ticket to Done; a human does that.",
			"Never delete a ticket.",
		]);
	});
});

describe("the reviewer prompt", () => {
	test("runs /code-review on the PR and posts findings to margin, never GitHub", () => {
		expectFragments(reviewer, [
			"agent:reviewer-cde-42",
			`/code-review ${pr}`,
			"command -v margin",
			`margin add ${pr} --path <file> --line <n> --author reviewer-cde-42 --body`,
			"Never post a finding as a GitHub comment.",
		]);
	});

	test("writes one summary comment with the verdict clean or changes needed", () => {
		expectFragments(reviewer, [
			"one summary comment",
			"trellis comment CDE-42 --body",
			"Verdict: clean",
			"Verdict: changes needed",
		]);
	});
});

describe("every role prompt", () => {
	test("carries the project and the ticket it was given and no em dash", () => {
		const other = [
			rolePrompt({ role: "manager", project: "TRL", statuses: null }),
			rolePrompt({ role: "builder", project: "TRL", ticket: "TRL-7" }),
			rolePrompt({ role: "reviewer", project: "TRL", ticket: "TRL-7", prUrl: pr }),
		];
		for (const text of other) expect(text).not.toContain("CDE");
		for (const text of [manager, builder, reviewer, ...other]) {
			expect(text).not.toContain("—");
			expect(text).toEndWith("\n");
		}
	});

	test("the api index exports the prompt and the launch builder", () => {
		expect(api).toHaveProperty("rolePrompt");
		expect(api).toHaveProperty("agentLaunch");
	});
});
