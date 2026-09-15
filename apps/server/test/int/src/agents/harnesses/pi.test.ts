import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePiEvent, preparePi } from "../../../../../src/agents/harnesses/pi/pi.ts";

test("Pi extension forwards native events while launch selects exact session and model", async () => {
	const configDirectory = await mkdtemp(join(tmpdir(), "trellis-pi-extension-"));
	try {
		const sink = join(configDirectory, "sink.mjs");
		const eventsFile = join(configDirectory, "events.jsonl");
		await writeFile(
			sink,
			`import {appendFileSync} from 'node:fs'; let data=''; for await (const chunk of process.stdin) data+=chunk; if(JSON.parse(data).payload.text === "delayed") await new Promise(done=>setTimeout(done,100)); appendFileSync(${JSON.stringify(eventsFile)},data+'\\n');`,
		);
		const input = {
			cwd: configDirectory,
			configDirectory,
			prompt: "a ' quoted prompt",
			model: "provider/model",
			resume: false as const,
			hookCommand: `node '${sink}'`,
		};
		const launch = await preparePi(input);
		expect(launch.executable).toBe("pi");
		expect(launch.args).toEqual([
			"--tools",
			"read,bash,edit,write,grep,find,ls",
			"--extension",
			join(configDirectory, "trellis-pi.mjs"),
			"--model",
			"provider/model",
			input.prompt,
		]);
		const module = await import(join(configDirectory, "trellis-pi.mjs"));
		const callbacks = new Map();
		module.default({ on: (event: string, callback: unknown) => callbacks.set(event, callback) });
		const context = { sessionManager: { getSessionId: () => "exact-vendor-id" }, model: { id: "provider/model" } };
		for (const event of [
			"session_start",
			"input",
			"agent_start",
			"tool_execution_start",
			"tool_execution_update",
			"tool_execution_end",
			"agent_end",
			"model_select",
		]) {
			await callbacks.get(event)({ type: event, text: "receipt-text" }, context);
		}
		const events = (await readFile(eventsFile, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(events).toHaveLength(8);
		expect(events[1]).toEqual({
			harness: "pi",
			event: "input",
			sessionId: "exact-vendor-id",
			model: "provider/model",
			payload: { type: "input", text: "receipt-text" },
		});
		await Promise.all([
			callbacks.get("input")({ type: "input", text: "delayed" }, context),
			callbacks.get("agent_start")({ type: "agent_start" }, context),
		]);
		const ordered = (await readFile(eventsFile, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(ordered.slice(-2).map((event) => event.event)).toEqual(["input", "agent_start"]);
		const resumed = await preparePi({ ...input, resume: true, sessionId: "exact-vendor-id" });
		expect(resumed.args.slice(-3)).toEqual(["--session", "exact-vendor-id", input.prompt]);
		expect(resumed.args).not.toContain("--continue");
		expect(resumed.args).not.toContain("--print");
	} finally {
		await rm(configDirectory, { recursive: true, force: true });
	}
});

test("Pi preserves native identity, receipts, tools and turn completion", () => {
	const base = { sessionId: "vendor-id", model: "provider/model" };
	expect(parsePiEvent({ ...base, event: "session_start", payload: {} })).toEqual([{ kind: "session", ...base }]);
	expect(parsePiEvent({ ...base, event: "input", payload: { text: "trellis-message:123\nhello" } })).toEqual([
		{ kind: "prompt", ...base, prompt: "trellis-message:123\nhello" },
	]);
	expect(parsePiEvent({ ...base, event: "agent_start", payload: {} })).toEqual([{ kind: "working", ...base }]);
	expect(
		parsePiEvent({
			...base,
			event: "tool_execution_start",
			payload: { toolCallId: "tool1", toolName: "bash", args: { command: "pwd" } },
		}),
	).toEqual([{ kind: "tool-start", ...base, tool: { id: "tool1", name: "bash", input: { command: "pwd" } } }]);
	expect(
		parsePiEvent({
			...base,
			event: "agent_end",
			payload: { messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" }] },
		}),
	).toEqual([{ kind: "idle", ...base, result: "done", outcome: "completed" }]);
});

test("Pi distinguishes provider errors and aborted turns from successful output", () => {
	expect(
		parsePiEvent({
			event: "agent_end",
			payload: { messages: [{ role: "assistant", stopReason: "error", errorMessage: "quota" }] },
		}),
	).toEqual([
		{ kind: "error", error: "quota", outcome: "failed" },
		{ kind: "idle", outcome: "failed" },
	]);
	expect(
		parsePiEvent({
			event: "agent_end",
			payload: {
				messages: [{ role: "assistant", stopReason: "aborted", content: [{ type: "text", text: "partial" }] }],
			},
		}),
	).toEqual([{ kind: "idle", outcome: "interrupted" }]);
});
