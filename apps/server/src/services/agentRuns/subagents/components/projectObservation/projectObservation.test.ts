import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseClaudeEvent } from "../../../../../agents/harnesses/claude/parseClaudeEvent.ts";
import { CodexAppServerEvents } from "../../../../../agents/harnesses/codex/appServerEvents.ts";
import { projectObservation } from "./projectObservation.ts";

const observedAt = "2026-10-10T10:00:00.000Z";
const project = (provider: string, event: Parameters<typeof projectObservation>[3]["event"]) =>
	projectObservation("parent", "attempt", provider, { event, observedAt });

test("Codex spawn and wait results retain exact child IDs and reported status", () => {
	const parser = new CodexAppServerEvents("thread");
	const events = (tool: string, status: string, message: string | null) =>
		parser.parse({
			method: "item/completed",
			params: {
				threadId: "thread",
				turnId: "turn",
				item: {
					type: "collabAgentToolCall",
					id: tool === "spawnAgent" ? "spawn" : "wait",
					tool,
					status: "completed",
					senderThreadId: "thread",
					receiverThreadIds: ["child"],
					prompt: tool === "spawnAgent" ? "Review this API." : null,
					agentsStates: { child: { status, message } },
				},
			},
		});
	const spawn = events("spawnAgent", "running", null).flatMap((event) => project("codex", event));
	expect(spawn).toMatchObject([
		{
			kind: "spawn",
			toolCallId: "spawn",
			prompt: "Review this API.",
			state: "result-recorded",
			providerChildIds: ["child"],
		},
		{ kind: "status", providerChildId: "child", state: "running" },
	]);
	const wait = events("wait", "completed", "The API passed.").flatMap((event) => project("codex", event));
	expect(wait).toMatchObject([
		{ kind: "status", providerChildId: "child", state: "completed", output: "The API passed." },
	]);
});

test("the recorded Codex wait fixture does not create a child", () => {
	const raw = readFileSync(
		new URL("../../../../../agents/harnesses/codex/fixtures/stdinAndAgent.jsonl", import.meta.url),
		"utf8",
	)
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	const parser = new CodexAppServerEvents(raw[0].params.threadId);
	expect(raw.flatMap((entry) => parser.parse(entry)).flatMap((event) => project("codex", event))).toEqual([]);
});

test("Claude root Agent and Task preserve the prompt and recorded result without a guessed child", () => {
	for (const tool_name of ["Agent", "Task"]) {
		const payload = {
			session_id: "thread",
			tool_use_id: "spawn",
			tool_name,
			tool_input: { prompt: "Review this API." },
		};
		const started = parseClaudeEvent({ ...payload, hook_event_name: "PreToolUse" }).flatMap((event) =>
			project("claude", event),
		);
		const ended = parseClaudeEvent({
			...payload,
			hook_event_name: "PostToolUse",
			tool_response: "Review saved.",
		}).flatMap((event) => project("claude", event));
		expect(started).toMatchObject([
			{ toolCallId: "spawn", prompt: "Review this API.", state: "started", providerChildIds: [] },
		]);
		expect(ended).toMatchObject([
			{ toolCallId: "spawn", state: "result-recorded", output: "Review saved.", providerChildIds: [] },
		]);
		const background = parseClaudeEvent({
			...payload,
			hook_event_name: "PostToolUse",
			tool_response: { agentId: "child", status: "running" },
		}).flatMap((event) => project("claude", event));
		expect(background).toMatchObject([{ state: "result-recorded", providerChildIds: ["child"] }]);
		expect(parseClaudeEvent({ ...payload, hook_event_name: "PreToolUse", agent_id: "child" })).toEqual([]);
	}
});
