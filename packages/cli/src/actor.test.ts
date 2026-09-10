import { describe, expect, test } from "bun:test";
import { ActorHeaderSchema } from "@trellis/api";
import { lines, runCli } from "../test/deps.ts";
import { project, ticket, ticketSummary } from "../test/fixtures.ts";
import { resolveActor } from "./actor.ts";

// `resolveActor` walks the chain --as, TRELLIS_ACTOR, CLAUDECODE,
// CLAUDE_SESSION_ID, CODEX_*, git config user.name, OS user. It returns
// `{ actor, kind, name, source, session, steps }`: `actor` is the header
// value `kind:name`, `source` names the step that gave the name.
type ResolveInput = {
	as?: string;
	env: Record<string, string | undefined>;
	gitUserName: () => string;
	osUser: () => string;
};

const resolve = (input: Partial<ResolveInput>) =>
	resolveActor({ env: {}, gitUserName: () => "", osUser: () => "navid", ...input });

describe("the chain", () => {
	// CLI-15
	test("--as kind:name wins the chain", () => {
		const result = resolve({ as: "agent:reviewer", env: { TRELLIS_ACTOR: "agent:codex", CLAUDECODE: "1" } });
		expect(result.actor).toBe("agent:reviewer");
		expect(result.source).toBe("--as");
	});

	// CLI-16
	test("--as name keeps the inferred human kind", () => {
		expect(resolve({ as: "navid" }).actor).toBe("human:navid");
	});

	// CLI-17
	test("--as name keeps the inferred agent kind", () => {
		expect(resolve({ as: "bot", env: { CLAUDECODE: "1" } }).actor).toBe("agent:bot");
	});

	// CLI-18
	test("TRELLIS_ACTOR is the second step", () => {
		const result = resolve({ env: { TRELLIS_ACTOR: "agent:codex" } });
		expect(result.actor).toBe("agent:codex");
		expect(result.source).toBe("TRELLIS_ACTOR");
	});

	// CLI-19
	test("TRELLIS_ACTOR without a kind keeps the inferred kind", () => {
		expect(resolve({ env: { TRELLIS_ACTOR: "zoe", CODEX_SANDBOX: "1" } }).actor).toBe("agent:zoe");
	});

	// CLI-20
	test("CLAUDECODE marks an agent named claude-code", () => {
		const result = resolve({ env: { CLAUDECODE: "1" } });
		expect(result.actor).toBe("agent:claude-code");
		expect(result.source).toBe("CLAUDECODE");
	});

	// CLI-21
	test("CLAUDE_SESSION_ID marks an agent and carries the session", () => {
		const result = resolve({ env: { CLAUDE_SESSION_ID: "session_abc" } });
		expect(result.actor).toBe("agent:claude-code");
		expect(result.session).toBe("session_abc");
	});

	// Claude Code exports CLAUDE_CODE_SESSION_ID, so activity.meta.session
	// tells two concurrent Claude Code runs apart.
	test("CLAUDE_CODE_SESSION_ID marks an agent and carries the session", () => {
		const result = resolve({ env: { CLAUDE_CODE_SESSION_ID: "session_code" } });
		expect(result.actor).toBe("agent:claude-code");
		expect(result.source).toBe("CLAUDE_CODE_SESSION_ID");
		expect(result.session).toBe("session_code");
	});

	test("CLAUDE_CODE_SESSION_ID wins over CLAUDE_SESSION_ID for the session", () => {
		const env = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "session_code", CLAUDE_SESSION_ID: "session_abc" };
		const result = resolve({ env });
		expect(result.source).toBe("CLAUDECODE");
		expect(result.session).toBe("session_code");
	});

	// CLI-22
	test("a CODEX_ variable marks an agent named codex", () => {
		expect(resolve({ env: { CODEX_THREAD_ID: "t1" } }).actor).toBe("agent:codex");
	});

	// CLI-23
	test("unlisted variables never mark an agent", () => {
		const result = resolve({
			env: { CLAUDE_CONFIG_DIR: "/x", ANTHROPIC_API_KEY: "k", CODEXX: "1" },
			gitUserName: () => "Navid",
		});
		expect(result.kind).toBe("human");
	});

	// CLI-24
	test("a bare agent kind gets the name agent", () => {
		expect(resolve({ as: "agent" }).actor).toBe("agent:agent");
	});

	// CLI-25: stdout is a pipe, so the format is JSON, and the kind stays human.
	test("a piped stdout stays human", async () => {
		const result = await runCli(
			["list"],
			{ "tickets.list": { items: [ticketSummary()], nextCursor: null } },
			{ env: {}, gitUserName: "navid", tty: false },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]!.request.headers.get("x-trellis-actor")).toBe("human:navid");
		expect(JSON.parse(result.stdout)).toEqual([ticketSummary()]);
	});
});

describe("the git name", () => {
	// CLI-26
	test("the git name loses its diacritics", () => {
		const result = resolve({ gitUserName: () => "Zoë Müller-Ångström" });
		expect(result.actor).toBe("human:Zoe Muller-Angstrom");
		expect(result.source).toBe("git");
	});

	// CLI-27
	test("the git name is cut to the header grammar", () => {
		const result = resolve({ gitUserName: () => "Ann: 李" });
		expect(result.name).toBe("Ann");
		const long = resolve({ gitUserName: () => "x".repeat(80) });
		expect(long.name).toHaveLength(64);
		expect(() => ActorHeaderSchema.parse(result.actor)).not.toThrow();
		expect(() => ActorHeaderSchema.parse(long.actor)).not.toThrow();
	});

	// CLI-28: the hint prints once per process, even when a verb makes two
	// requests, and only when the name came from git onto a TTY stderr.
	test("the git name prints a one-time TRELLIS_ACTOR hint", async () => {
		const routes = { "projects.get": project({ repos: [] }), "projects.setRepos": [] };
		const hinted = await runCli(["projects", "repos", "CDE", "--add", "0x962/trellis"], routes, {
			env: {},
			gitUserName: "Navid",
			stderrTty: true,
		});
		expect(hinted.code).toBe(0);
		expect(hinted.calls).toHaveLength(2);
		expect(lines(hinted.stderr)).toHaveLength(1);
		expect(hinted.stderr).toContain("TRELLIS_ACTOR");

		const piped = await runCli(
			["show", "CDE-1"],
			{ "tickets.get": ticket() },
			{
				env: {},
				gitUserName: "Navid",
				stderrTty: false,
			},
		);
		expect(piped.stderr).toBe("");

		const flagged = await runCli(
			["--as", "navid", "show", "CDE-1"],
			{ "tickets.get": ticket() },
			{
				env: {},
				gitUserName: "Navid",
				stderrTty: true,
			},
		);
		expect(flagged.stderr).toBe("");

		const fromEnv = await runCli(
			["show", "CDE-1"],
			{ "tickets.get": ticket() },
			{
				env: { TRELLIS_ACTOR: "human:navid" },
				gitUserName: "Navid",
				stderrTty: true,
			},
		);
		expect(fromEnv.stderr).toBe("");
	});

	// CLI-29
	test("the OS user is the last step", () => {
		const result = resolve({ gitUserName: () => "", osUser: () => "navid" });
		expect(result.actor).toBe("human:navid");
		expect(result.source).toBe("os");
	});
});

describe("an invalid --as", () => {
	// CLI-30
	test("an invalid --as exits 2 before any request", async () => {
		for (const value of ["system:trellis", "agent:a:b", "agent:", "n".repeat(65)]) {
			const result = await runCli(["--as", value, "show", "CDE-1"], { "tickets.get": ticket() });
			expect(result.code, value).toBe(2);
			expect(lines(result.stderr), value).toHaveLength(1);
			expect(result.stderr, value).toContain("<human|agent>:<name>");
			expect(result.calls, value).toEqual([]);
		}
	});
});
