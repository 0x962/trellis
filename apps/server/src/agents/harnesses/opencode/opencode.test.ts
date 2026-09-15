import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCodeInterrupt, parseOpenCodeEvent, prepareOpenCode } from "./opencode.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true });
});
const input = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-opencode-"));
	homes.push(home);
	return {
		cwd: home,
		configDirectory: join(home, "config"),
		prompt: "one prompt",
		model: "anthropic/claude-sonnet-4-6",
		sessionId: "ses_exact",
		resume: false as const,
		hookCommand: "/bin/cat",
	};
};
test("OpenCode starts with explicit model, permission bypass and a private plugin", async () => {
	const options = await input();
	const launch = await prepareOpenCode(options);
	expect(launch.executable).toBe("opencode");
	expect(launch.args).toEqual(["--model", options.model, "--prompt", options.prompt]);
	expect(JSON.parse(launch.env.OPENCODE_PERMISSION!)).toEqual({ "*": "allow" });
	const config = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT!);
	expect(config.permission).toBe("allow");
	expect(config.autoupdate).toBe(false);
	expect(launch.env.OPENCODE_DISABLE_AUTOUPDATE).toBe("1");
	expect(await readFile(new URL(config.plugin[0]), "utf8")).toContain("chat.message");
});
test("OpenCode resumes only the selected session and interrupts with Escape", async () => {
	const options = await input();
	const launch = await prepareOpenCode({ ...options, resume: true });
	expect(launch.args).toContain("--session");
	expect(launch.args[launch.args.indexOf("--session") + 1]).toBe("ses_exact");
	expect(launch.args).not.toContain("--continue");
	expect(openCodeInterrupt).toBe("\u001b");
});
test("OpenCode exposes native IDs, exact prompt, model, tool calls and idle result", () => {
	expect(
		parseOpenCodeEvent({
			event: "prompt",
			sessionId: "ses_1",
			turnId: "msg_1",
			prompt: "trellis-message:abc\nDo this",
			model: "p/m",
		}),
	).toEqual([
		{ kind: "prompt", sessionId: "ses_1", turnId: "msg_1", prompt: "trellis-message:abc\nDo this", model: "p/m" },
	]);
	expect(
		parseOpenCodeEvent({
			event: "tool-start",
			sessionId: "ses_1",
			turnId: "msg_1",
			tool: { id: "call_1", name: "bash", input: { command: "pwd" } },
		})[0],
	).toMatchObject({ kind: "tool-start", tool: { id: "call_1", name: "bash" } });
	expect(
		parseOpenCodeEvent({ event: "idle", sessionId: "ses_1", turnId: "msg_1", result: "Done", outcome: "completed" })[0],
	).toMatchObject({ kind: "idle", result: "Done", outcome: "completed" });
});
