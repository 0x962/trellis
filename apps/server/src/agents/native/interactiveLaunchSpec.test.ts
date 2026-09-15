import { expect, test } from "bun:test";
import { interactiveLaunchSpec } from "./interactiveLaunchSpec.ts";

test("an interactive Claude launch keeps the command and installs turn hooks on a PTY", () => {
	const spec = interactiveLaunchSpec({
		id: "attempt",
		command: "exec claude --dangerously-skip-permissions 'assignment'",
		cwd: "/tmp/project",
		env: { TRELLIS_ATTEMPT_TOKEN: "secret-token" },
		preset: "claude",
		hookCommand: "/bin/bun '/tmp/turn hook.ts'",
		timeoutMs: 5000,
	});
	expect(spec.mode).toBe("pty");
	expect(spec.args[2]).toContain("exec claude --dangerously-skip-permissions 'assignment'");
	expect(spec.args[2]).toContain("--settings");
	for (const event of ["SessionStart", "UserPromptSubmit", "Stop"]) expect(spec.args[2]).toContain(event);
	expect(spec.args[2]).not.toContain("secret-token");
	expect(spec.args[2]).not.toContain("--print");
	expect(spec.env?.TRELLIS_ATTEMPT_TOKEN).toBe("secret-token");
	expect(spec.timeoutMs).toBe(5000);
});

test("other interactive commands use the same PTY without Claude settings", () => {
	const spec = interactiveLaunchSpec({
		id: "attempt",
		command: "exec pi",
		cwd: "/tmp",
		env: {},
		preset: "pi",
		hookCommand: "hook",
	});
	expect(spec.mode).toBe("pty");
	expect(spec.args).toEqual(["-l", "-c", "exec pi"]);
});
