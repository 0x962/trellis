import { expect, test } from "bun:test";
import { prepareClaude } from "./prepareClaude.ts";

test("starts a text-only observer with a fixed conversation and the requested model", async () => {
	const launch = await prepareClaude({
		cwd: "/observer",
		prompt: "Evidence",
		hookCommand: "hook",
		configDirectory: "/config",
		model: "claude-sonnet-5-5",
		effort: "medium",
		resume: false,
		sessionId: "observer-session",
		textOnly: { systemPath: "/config/system.txt" },
	});
	expect(launch.args).toEqual(
		expect.arrayContaining([
			"--tools",
			"",
			"--strict-mcp-config",
			"--disable-slash-commands",
			"--system-prompt-file",
			"/config/system.txt",
			"--model",
			"claude-sonnet-5-5",
			"--session-id",
			"observer-session",
		]),
	);
	expect(launch.args).not.toContain("--dangerously-skip-permissions");
	expect(launch.args).not.toContain("--fallback-model");
	expect(launch.args).not.toContain("Evidence");
});

test("resumes exactly the saved observer conversation", async () => {
	const launch = await prepareClaude({
		cwd: "/observer",
		prompt: "Next evidence",
		hookCommand: "hook",
		configDirectory: "/config",
		model: "claude-sonnet-5-5",
		resume: true,
		sessionId: "same-session",
		textOnly: { systemPath: "/config/system.txt" },
	});
	expect(launch.args).toContain("--resume");
	expect(launch.args[launch.args.indexOf("--resume") + 1]).toBe("same-session");
	expect(launch.args).not.toContain("--fork-session");
});
