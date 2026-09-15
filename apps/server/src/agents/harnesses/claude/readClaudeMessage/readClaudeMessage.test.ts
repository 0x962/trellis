import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readClaudeMessage } from "./readClaudeMessage.ts";

const homes: string[] = [];
afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});
const transcript = async (rows: unknown[], suffix = "") => {
	const home = await mkdtemp("/tmp/trl-claude-message-");
	homes.push(home);
	const path = join(home, "session.jsonl");
	await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n${suffix}`);
	return path;
};
const assistant = (text: string, at: string) => ({
	type: "assistant",
	sessionId: "session",
	timestamp: at,
	message: { content: [{ type: "text", text }] },
});

test("the latest assistant text keeps its timestamp across large tool records and a partial final record", async () => {
	const path = await transcript(
		[
			assistant("Old message", "2026-09-15T12:00:00.000Z"),
			assistant("I will run the tests.", "2026-09-15T12:01:00.000Z"),
			{ type: "assistant", sessionId: "session", message: { content: [{ type: "tool_use", id: "tool" }] } },
			{ type: "user", content: "x".repeat(150000) },
		],
		'{"type":"assistant"',
	);
	expect(await readClaudeMessage(path, "session")).toEqual({
		text: "I will run the tests.",
		at: "2026-09-15T12:01:00.000Z",
	});
});

test("another session and reasoning content cannot replace the assistant message", async () => {
	const path = await transcript([
		assistant("Visible message", "2026-09-15T12:00:00.000Z"),
		{ ...assistant("Child message", "2026-09-15T12:01:00.000Z"), sessionId: "child" },
		{ type: "assistant", sessionId: "session", message: { content: [{ type: "thinking", thinking: "private" }] } },
	]);
	expect((await readClaudeMessage(path, "session"))!.text).toBe("Visible message");
	expect(await readClaudeMessage(path, "absent")).toBeNull();
});
