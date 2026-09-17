import { afterEach, beforeEach, expect, test } from "bun:test";
import { appendFile, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { originDir } from "../../../../../../../test/originDir.ts";
import { managerReadiness } from "../../../../../src/agents/managerTools/managerReadiness.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
beforeEach(async () => {
	fixture = await harnessHostFixture({ nestedRuntime: true });
	await fixture.client.start({
		id: "attempt",
		command: "/bin/cat",
		args: [],
		cwd: fixture.home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "secret" },
	});
});
afterEach(async () => {
	await fixture.client.shutdown();
	await new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await rm(fixture.home, { recursive: true, force: true });
});

const hook = async (payload: Record<string, unknown>, env: Record<string, string> = {}, exitCode = 0) => {
	const child = Bun.spawn([process.execPath, join(originDir(import.meta.dir), "hook.ts")], {
		env: {
			...process.env,
			TRELLIS_HARNESS: "claude",
			TRELLIS_HARNESS_SOCKET: join(fixture.home, "runtime", "runtime.sock"),
			TRELLIS_ATTEMPT_ID: "attempt",
			TRELLIS_ATTEMPT_TOKEN: "secret",
			...env,
		},
		stdin: new Blob([JSON.stringify({ session_id: "session", ...payload })]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const error = await new Response(child.stderr).text();
	expect(await child.exited, error).toBe(exitCode);
	return error;
};

test("Claude hooks expose intermediate text and completed tool details through runtime inspection", async () => {
	const path = join(fixture.home, "transcript.jsonl");
	const row = (text: string, timestamp: string) =>
		JSON.stringify({
			type: "assistant",
			sessionId: "session",
			timestamp,
			message: { content: [{ type: "text", text }] },
		});
	await writeFile(path, `${row("I will run the tests.", "2026-09-15T12:00:00.000Z")}\n`);
	await hook({ hook_event_name: "UserPromptSubmit", prompt: "Run the tests" });
	const tool = {
		transcript_path: path,
		prompt_id: "turn",
		tool_use_id: "tool",
		tool_name: "Bash",
		tool_input: { command: "bun test" },
	};
	await hook({ ...tool, hook_event_name: "PreToolUse" });
	expect(await fixture.client.inspect("attempt")).toMatchObject({
		activity: { state: "working" },
		agent: {
			lastTool: { name: "Bash", input: { command: "bun test" }, status: "running", startedAt: expect.any(String) },
			lastMessage: { text: "I will run the tests.", at: "2026-09-15T12:00:00.000Z" },
		},
	});
	await hook({ ...tool, hook_event_name: "PostToolUse", tool_response: "44 pass" });
	await appendFile(path, `${row("Tests pass.", "2026-09-15T12:00:10.000Z")}\n`);
	await hook({
		transcript_path: path,
		prompt_id: "turn",
		hook_event_name: "Stop",
		last_assistant_message: "Tests pass.",
	});
	expect(await fixture.client.inspect("attempt")).toMatchObject({
		activity: { state: "idle" },
		agent: {
			tool: null,
			lastTool: {
				input: { command: "bun test" },
				output: "44 pass",
				status: "completed",
				updatedAt: expect.any(String),
			},
			lastMessage: { text: "Tests pass.", at: "2026-09-15T12:00:10.000Z" },
		},
	});
});

test.each(["missing", "old-attempt", "wrong-token", "corrupt"])(
	"Claude manager blocks its prompt when tool discovery is %s",
	async (state) => {
		const path = join(fixture.home, "manager-tools-ready.json");
		if (state !== "missing")
			await writeFile(
				path,
				state === "corrupt"
					? "{"
					: JSON.stringify({
							attemptId: state === "old-attempt" ? "previous-attempt" : "attempt",
							token: state === "wrong-token" ? "previous-token" : "secret",
						}),
			);
		const error = await hook(
			{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue" },
			{ TRELLIS_MANAGER_TOOLS_READY: path },
			2,
		);
		expect(error).toContain("Trellis tools are not ready");
		const status = await fixture.client.inspect("attempt");
		expect(status.acknowledgedMessageIds).not.toContain("attempt");
		expect(status.agent).toMatchObject({
			outcome: "failed",
			error: expect.stringContaining("Trellis tools are not ready"),
		});
		await expect(
			fixture.host.waitFor("attempt", (session) => session.acknowledgedMessageIds.includes("attempt")),
		).rejects.toThrow("Trellis tools are not ready");
	},
	10000,
);

test("Claude manager acknowledges the exact prompt after its MCP entry serves tools/list", async () => {
	const path = join(fixture.home, "manager-tools-ready.json");
	const child = Bun.spawn([process.execPath, join(originDir(import.meta.dir), "../managerTools/entry.ts")], {
		env: {
			...process.env,
			TRELLIS_URL: "http://127.0.0.1:1",
			TRELLIS_ACTOR: "agent:manager",
			TRELLIS_ATTEMPT_ID: "attempt",
			TRELLIS_ATTEMPT_TOKEN: "secret",
			TRELLIS_MANAGER_TOOLS_READY: path,
		},
		stdin: new Blob([`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const response = JSON.parse(await new Response(child.stdout).text());
	expect(await child.exited, await new Response(child.stderr).text()).toBe(0);
	expect(response.result.tools.length).toBeGreaterThan(0);
	expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ attemptId: "attempt", token: "secret" });
	expect((await stat(path)).mode & 0o777).toBe(0o600);
	await hook(
		{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue", prompt_id: "old-turn" },
		{ TRELLIS_MANAGER_TOOLS_READY: path },
	);
	expect((await fixture.client.inspect("attempt")).acknowledgedMessageIds).toContain("attempt");
});

test("Claude manager still blocks when the runtime cannot receive the startup error", async () => {
	await writeFile(join(fixture.home, "missing-ready.json"), "{}");
	await hook(
		{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue" },
		{
			TRELLIS_MANAGER_TOOLS_READY: join(fixture.home, "missing-ready.json"),
			TRELLIS_HARNESS_SOCKET: join(fixture.home, "missing-runtime.sock"),
		},
		2,
	);
});

test("Claude manager exits before its hook timeout when runtime error reporting stalls", async () => {
	const socket = join(fixture.home, "stalled-runtime.sock");
	const server = createServer((connection) => connection.resume());
	await new Promise<void>((resolve) => server.listen(socket, resolve));
	try {
		const started = performance.now();
		await hook(
			{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue" },
			{
				TRELLIS_MANAGER_TOOLS_READY: join(fixture.home, "missing-ready.json"),
				TRELLIS_HARNESS_SOCKET: socket,
			},
			2,
		);
		expect(performance.now() - started).toBeLessThan(9500);
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
}, 10000);

test.each(["initialize", "invalid"])("MCP %s does not confirm manager tool discovery", async (method) => {
	const path = join(fixture.home, "manager-tools-ready.json");
	const child = Bun.spawn([process.execPath, join(originDir(import.meta.dir), "../managerTools/entry.ts")], {
		env: {
			...process.env,
			TRELLIS_URL: "http://127.0.0.1:1",
			TRELLIS_ACTOR: "agent:manager",
			TRELLIS_ATTEMPT_ID: "attempt",
			TRELLIS_ATTEMPT_TOKEN: "secret",
			TRELLIS_MANAGER_TOOLS_READY: path,
		},
		stdin: new Blob([method === "invalid" ? "{\n" : `${JSON.stringify({ jsonrpc: "2.0", id: 1, method })}\n`]),
		stdout: "pipe",
		stderr: "pipe",
	});
	await new Response(child.stdout).text();
	expect(await child.exited, await new Response(child.stderr).text()).toBe(0);
	expect(await Bun.file(path).exists()).toBe(false);
});

test("Claude manager waits for tool discovery after its prompt hook starts", async () => {
	const path = join(fixture.home, "delayed-ready.json");
	const ready = setTimeout(() => managerReadiness.record(path, "attempt", "secret"), 500);
	try {
		await hook(
			{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue" },
			{ TRELLIS_MANAGER_TOOLS_READY: path },
		);
		expect((await fixture.client.inspect("attempt")).acknowledgedMessageIds).toContain("attempt");
	} finally {
		clearTimeout(ready);
	}
});

test("Claude manager blocks a discovered prompt when runtime acknowledgment fails", async () => {
	const path = join(fixture.home, "ready.json");
	managerReadiness.record(path, "attempt", "secret");
	const error = await hook(
		{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue" },
		{ TRELLIS_MANAGER_TOOLS_READY: path, TRELLIS_HARNESS_SOCKET: join(fixture.home, "missing.sock") },
		2,
	);
	expect(error).toContain("Trellis");
});

test("Claude manager shares one deadline between discovery and prompt acknowledgment", async () => {
	const socket = join(fixture.home, "stalled-ack.sock");
	const path = join(fixture.home, "delayed-ready.json");
	const server = createServer((connection) => connection.resume());
	await new Promise<void>((resolve) => server.listen(socket, resolve));
	const ready = setTimeout(() => managerReadiness.record(path, "attempt", "secret"), 500);
	try {
		const started = performance.now();
		const error = await hook(
			{ hook_event_name: "UserPromptSubmit", prompt: "trellis-message:attempt\nContinue" },
			{ TRELLIS_MANAGER_TOOLS_READY: path, TRELLIS_HARNESS_SOCKET: socket },
			2,
		);
		expect(error).toContain("Trellis");
		expect(performance.now() - started).toBeLessThan(9500);
	} finally {
		clearTimeout(ready);
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
}, 15000);
