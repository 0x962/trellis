import { describe, expect, test } from "bun:test";
import { agentSession, managerSession, sessionId } from "../../test/agentFixtures.ts";
import { lines, runCli } from "../../test/deps.ts";
import { rpcError } from "../../test/fakeServer.ts";
import { activity, comment, ticketSummary } from "../../test/fixtures.ts";

const pr = "https://github.com/o/r/pull/7";

const inboxAnswer = () => ({
	events: [activity()],
	tickets: [ticketSummary()],
	comments: [comment()],
	cursor: 7,
	more: false,
});

describe("agents inbox", () => {
	test("reads the inbox of the project and prints the procedure output as JSON", async () => {
		const result = await runCli(["agents", "inbox", "--project", "CDE", "--json"], {
			"agents.inbox": inboxAnswer(),
		});
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.input)).toEqual([{ project: "CDE" }]);
		expect(result.calls[0]!.path).toBe("agents.inbox");
		expect(JSON.parse(result.stdout)).toEqual(inboxAnswer());
	});

	test("on a TTY it prints each event with its ticket, each comment body, and the cursor", async () => {
		const result = await runCli(
			["agents", "inbox", "--project", "CDE"],
			{ "agents.inbox": inboxAnswer() },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		for (const fragment of ["CDE-42", "ticket.moved", "human:dana", "todo -> human-review", "Body A", "cursor 7"]) {
			expect(result.stdout, fragment).toContain(fragment);
		}
	});

	test("without --project it exits 2 and sends nothing", async () => {
		const result = await runCli(["agents", "inbox"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("--project");
		expect(result.calls).toEqual([]);
	});
});

describe("agents register", () => {
	const superset = {
		CLAUDECODE: "1",
		SUPERSET_WORKSPACE_ID: "ws-env",
		SUPERSET_TERMINAL_ID: "term-env",
		CLAUDE_CODE_SESSION_ID: "claude-env",
	};

	test("reads the workspace, the terminal, and the Claude session from the environment", async () => {
		const result = await runCli(
			["agents", "register", "--role", "manager", "--project", "CDE"],
			{ "agents.register": managerSession() },
			{ env: superset },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "agents.register" });
		expect(result.calls[0]!.input).toEqual({
			role: "manager",
			project: "CDE",
			workspaceId: "ws-env",
			terminalId: "term-env",
			claudeSessionId: "claude-env",
		});
	});

	test("flags win over the environment and a builder names its ticket", async () => {
		const argv = [
			...["agents", "register", "--role", "builder", "--project", "CDE", "--ticket", "CDE-42"],
			...["--workspace", "ws-flag", "--terminal", "term-flag", "--claude-session", "claude-flag"],
		];
		const result = await runCli(argv, { "agents.register": agentSession() }, { env: superset });
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({
			role: "builder",
			project: "CDE",
			ticket: "CDE-42",
			workspaceId: "ws-flag",
			terminalId: "term-flag",
			claudeSessionId: "claude-flag",
		});
	});

	test("outside Superset without flags it exits 2, names the variable, and sends nothing", async () => {
		const result = await runCli(["agents", "register", "--role", "manager", "--project", "CDE"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("SUPERSET_WORKSPACE_ID");
		expect(result.calls).toEqual([]);
	});
});

describe("agents start", () => {
	test("starts a builder for the ticket and prints the session", async () => {
		const result = await runCli(["agents", "start", "CDE-42", "--json"], { "agents.startBuilder": agentSession() });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "agents.startBuilder", input: { ticket: "CDE-42" } });
		expect(JSON.parse(result.stdout)).toEqual(agentSession());
	});

	test("at the limit it exits 4 with one line that states the limit", async () => {
		const result = await runCli(["agents", "start", "CDE-43"], {
			"agents.startBuilder": rpcError("CONCURRENCY_LIMIT", { limit: 3, running: 3 }),
		});
		expect(result.code).toBe(4);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("3 of 3 builders are running.");
		expect(result.stderr).toEndWith(" (CONCURRENCY_LIMIT)\n");
	});

	test("without a runner it exits 6 with one line that states the reason", async () => {
		const result = await runCli(["agents", "start", "CDE-42"], {
			"agents.startBuilder": rpcError("RUNNER_UNAVAILABLE", { reason: "unmapped" }),
		});
		expect(result.code).toBe(6);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("Reason: unmapped.");
		expect(result.stderr).toEndWith(" (RUNNER_UNAVAILABLE)\n");
	});
});

describe("agents review", () => {
	test("starts a reviewer for the ticket and the PR", async () => {
		const reviewer = agentSession({ role: "reviewer", title: "CDE-42 review" });
		const result = await runCli(["agents", "review", "CDE-42", "--pr", pr], { "agents.startReviewer": reviewer });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "agents.startReviewer", input: { ticket: "CDE-42", prUrl: pr } });

		const invalid = await runCli(["agents", "review", "CDE-42", "--pr", "https://example.com"], {
			"agents.startReviewer": rpcError("INVALID_PR_URL"),
		});
		expect(invalid.code).toBe(4);
		expect(invalid.stderr).toEndWith(" (INVALID_PR_URL)\n");
	});

	test("without --pr it exits 2 and sends nothing", async () => {
		const result = await runCli(["agents", "review", "CDE-42"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("--pr");
		expect(result.calls).toEqual([]);
	});
});

describe("agents stop", () => {
	test("stops the session by its id and prints it", async () => {
		const stopped = agentSession({ state: "stopped" });
		const result = await runCli(["agents", "stop", sessionId, "--json"], { "agents.stop": stopped });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "agents.stop", input: { id: sessionId } });
		expect(JSON.parse(result.stdout)).toEqual(stopped);
	});
});
