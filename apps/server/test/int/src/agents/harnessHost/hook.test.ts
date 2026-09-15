import { afterEach, beforeEach, expect, test } from "bun:test";
import { appendFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { originDir } from "../../../../../../../test/originDir.ts";
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

const hook = async (payload: Record<string, unknown>) => {
	const child = Bun.spawn([process.execPath, join(originDir(import.meta.dir), "hook.ts")], {
		env: {
			...process.env,
			TRELLIS_HARNESS: "claude",
			TRELLIS_HARNESS_SOCKET: join(fixture.home, "runtime", "runtime.sock"),
			TRELLIS_ATTEMPT_ID: "attempt",
			TRELLIS_ATTEMPT_TOKEN: "secret",
		},
		stdin: new Blob([JSON.stringify({ session_id: "session", ...payload })]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const error = await new Response(child.stderr).text();
	expect(await child.exited, error).toBe(0);
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
