import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";

const stepNames = [
	"--as",
	"TRELLIS_ACTOR",
	"CLAUDECODE",
	"CLAUDE_CODE_SESSION_ID",
	"CLAUDE_SESSION_ID",
	"CODEX_*",
	"git config user.name",
	"OS user",
];

describe("whoami", () => {
	// CLI-31: every step in chain order, the applied step marked, then the
	// actor and the session as the last two lines.
	test("whoami explains the chain", async () => {
		const result = await runCli(
			["whoami"],
			{},
			{ tty: true, env: { CLAUDE_SESSION_ID: "session_abc", CLAUDECODE: "1" } },
		);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		const positions = stepNames.map((name) => result.stdout.indexOf(name));
		for (const [index, position] of positions.entries()) {
			expect(position, stepNames[index]).toBeGreaterThanOrEqual(0);
			if (index > 0) expect(position, stepNames[index]).toBeGreaterThan(positions[index - 1]!);
		}
		const stepLine = (name: string) => lines(result.stdout).find((line) => line.includes(name))!;
		expect(stepLine("CLAUDECODE")).toContain("applied");
		for (const name of ["--as", "TRELLIS_ACTOR", "CODEX_*", "git config user.name", "OS user"]) {
			expect(stepLine(name), name).not.toContain("applied");
		}
		const tail = lines(result.stdout).slice(-2);
		expect(tail[0]).toContain("agent:claude-code");
		expect(tail[1]).toContain("session_abc");
	});

	// CLI-32
	test("whoami --json prints the resolution without a request", async () => {
		const result = await runCli(
			["whoami", "--json"],
			{},
			{ env: { CLAUDE_SESSION_ID: "session_abc", CLAUDECODE: "1" } },
		);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(lines(result.stdout)).toHaveLength(1);
		const parsed = JSON.parse(result.stdout);
		expect(Object.keys(parsed).sort()).toEqual(["actor", "kind", "name", "session", "source", "steps"]);
		expect(parsed).toMatchObject({
			actor: "agent:claude-code",
			kind: "agent",
			name: "claude-code",
			session: "session_abc",
		});
		expect(parsed.steps.map((step: { step: string }) => step.step)).toEqual(stepNames);
		expect(parsed.steps.filter((step: { applied: boolean }) => step.applied).length).toBeGreaterThanOrEqual(1);
	});

	// A Claude Code shell sets CLAUDECODE and CLAUDE_CODE_SESSION_ID and no
	// CLAUDE_SESSION_ID.
	test("whoami shows the session of a Claude Code shell", async () => {
		const env = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "session_code" };
		const result = await runCli(["whoami", "--json"], {}, { env });
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout);
		expect(parsed.session).toBe("session_code");
		const step = parsed.steps.find((entry: { step: string }) => entry.step === "CLAUDE_CODE_SESSION_ID");
		expect(step).toEqual({ step: "CLAUDE_CODE_SESSION_ID", applied: false, value: "session_code" });

		const table = await runCli(["whoami"], {}, { env, tty: true });
		expect(lines(table.stdout).at(-1)).toContain("session_code");
	});
});
