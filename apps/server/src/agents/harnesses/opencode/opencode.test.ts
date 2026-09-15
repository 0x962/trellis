import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOpenCodeEvent, prepareOpenCode } from "./opencode.ts";

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
	expect(launch.env.TRELLIS_OPENCODE_CONTROL_SOCKET).toStartWith("/tmp/trellis-oc-");
	expect(launch.env.TRELLIS_OPENCODE_CONTROL_TOKEN).toBeTruthy();
	expect(await readFile(new URL(config.plugin[0]), "utf8")).toContain("chat.message");
});
test("OpenCode resumes only the selected session", async () => {
	const options = await input();
	const launch = await prepareOpenCode({ ...options, resume: true });
	expect(launch.args).toContain("--session");
	expect(launch.args[launch.args.indexOf("--session") + 1]).toBe("ses_exact");
	expect(launch.args).not.toContain("--continue");
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

test("OpenCode managers use only the Trellis bridge and deny native tools", async () => {
	const options = await input();
	const managerSystemPrompt = `Database persona ${crypto.randomUUID()}`;
	const managerTools = { command: "/bin/trellis-host", args: ["manager-tools"] };
	const launch = await prepareOpenCode({ ...options, managerTools, managerSystemPrompt });
	expect(JSON.parse(launch.env.OPENCODE_PERMISSION!)).toEqual({ "*": "deny", "trellis_trellis_*": "allow" });
	expect(JSON.parse(launch.env.TRELLIS_MANAGER_TOOLS!)).toEqual(managerTools);
	const config = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT!);
	expect(config.mcp).toEqual({
		trellis: { type: "local", command: [managerTools.command, ...managerTools.args], enabled: true },
	});
	expect(config.agent["trellis-manager"].permission).toEqual({ "*": "deny", "trellis_trellis_*": "allow" });
	expect(config.agent["trellis-manager"].prompt).toBe(managerSystemPrompt);
	expect(launch.args).toContain("--agent");
	expect(launch.args[launch.args.indexOf("--agent") + 1]).toBe("trellis-manager");
});

test("OpenCode resumed managers receive the current database persona", async () => {
	const managerSystemPrompt = `Updated persona ${crypto.randomUUID()}`;
	const launch = await prepareOpenCode({
		...(await input()),
		resume: true,
		managerSystemPrompt,
		managerTools: { command: "/bin/trellis-host", args: ["manager-tools"] },
	});
	expect(JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT!).agent["trellis-manager"].prompt).toBe(managerSystemPrompt);
});
