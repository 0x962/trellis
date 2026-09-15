import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareOpenCode } from "../../../../../src/agents/harnesses/opencode/opencode.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true });
});

const openPlugin = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-opencode-hooks-"));
	homes.push(home);
	const events = join(home, "events.jsonl");
	const receiver = join(home, "receive.mjs");
	await writeFile(
		receiver,
		`import {appendFileSync} from 'node:fs'; let data=''; for await(const part of process.stdin) data+=part; appendFileSync(${JSON.stringify(events)},data+'\\n');`,
	);
	const launch = await prepareOpenCode({
		cwd: home,
		configDirectory: home,
		resume: false,
		prompt: "test",
		hookCommand: `${process.execPath} ${receiver}`,
	});
	const actions: { name: string; args: unknown[] }[] = [];
	type HookName =
		| "chat.message"
		| "chat.params"
		| "tool.execute.before"
		| "tool.execute.after"
		| "experimental.text.complete"
		| "event";
	const hooks = new Proxy({} as Record<HookName, (...args: unknown[]) => Promise<void>>, {
		get:
			(_target, name: string) =>
			async (...args: unknown[]) => {
				actions.push({ name, args });
			},
	});
	return {
		hooks,
		rows: async () => {
			const child = Bun.spawn(
				[
					process.execPath,
					"--eval",
					`const {url,actions}=JSON.parse(await Bun.stdin.text()); const {TrellisPlugin}=await import(url); const hooks=await TrellisPlugin({client:{session:{get:async()=>({data:{}})}}}); for(const action of actions) await hooks[action.name](...action.args);`,
				],
				{
					stdin: new Blob([
						JSON.stringify({ url: JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT!).plugin[0], actions }),
					]),
					env: { ...process.env, ...launch.env },
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
			if (code !== 0) throw new Error(stderr);
			return (await readFile(events, "utf8"))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
		},
	};
};

test("OpenCode reports the selected agent model and filters auxiliary model calls", async () => {
	const { hooks, rows } = await openPlugin();
	await hooks["chat.message"](
		{ sessionID: "ses_test" },
		{ message: { id: "msg_test", agent: "build" }, parts: [{ type: "text", text: "test" }] },
	);
	await hooks["chat.params"]({
		sessionID: "ses_test",
		agent: "title",
		message: { id: "msg_test" },
		provider: { id: "p" },
		model: { id: "small" },
	});
	await hooks["chat.params"]({
		sessionID: "ses_test",
		agent: "build",
		message: { id: "msg_test" },
		provider: { id: "p" },
		model: { id: "selected" },
	});
	expect((await rows()).filter((row) => row.event === "session").map((row) => row.model)).toEqual(["p/selected"]);
});

test("OpenCode preserves prompt receipts, tool progress, response text and interruption", async () => {
	const { hooks, rows } = await openPlugin();
	const message = { id: "msg_test", agent: "build" };
	await hooks["chat.message"](
		{ sessionID: "ses_test" },
		{ message, parts: [{ type: "text", text: "trellis-message:exact\nRun this" }] },
	);
	await hooks["tool.execute.before"](
		{ sessionID: "ses_test", callID: "call_1", tool: "bash" },
		{ args: { command: "pwd" } },
	);
	await hooks.event({
		event: {
			type: "message.part.updated",
			properties: {
				part: {
					type: "tool",
					sessionID: "ses_test",
					callID: "call_1",
					tool: "bash",
					state: { status: "running", input: { command: "pwd" }, metadata: { output: "partial" } },
				},
			},
		},
	});
	await hooks["tool.execute.after"]({ sessionID: "ses_test", callID: "call_1", tool: "bash" }, { output: "complete" });
	await hooks["experimental.text.complete"]({ sessionID: "ses_test", partID: "part_1" }, { text: "First" });
	await hooks["experimental.text.complete"]({ sessionID: "ses_test", partID: "part_2" }, { text: "Second" });
	await hooks.event({
		event: { type: "session.error", properties: { sessionID: "ses_test", error: { name: "MessageAbortedError" } } },
	});
	await hooks.event({
		event: { type: "session.status", properties: { sessionID: "ses_test", status: { type: "idle" } } },
	});
	expect(await rows()).toMatchObject([
		{ event: "prompt", prompt: "trellis-message:exact\nRun this", turnId: "msg_test" },
		{ event: "tool-start", tool: { id: "call_1", name: "bash" } },
		{ event: "tool-update", tool: { id: "call_1", output: { output: "partial" } } },
		{ event: "tool-end", tool: { id: "call_1", output: "complete" } },
		{ event: "message", message: { text: "First" } },
		{ event: "message", message: { text: "Second" } },
		{ event: "idle", result: "First\nSecond", outcome: "interrupted" },
	]);
});
