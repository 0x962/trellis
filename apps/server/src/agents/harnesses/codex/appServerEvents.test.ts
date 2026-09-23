import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { toolTarget } from "@trellis/api";
import type { HarnessEvent } from "../types.ts";
import { CodexAppServerEvents } from "./appServerEvents.ts";

// Each fixture holds the notifications of one real Codex app-server session
// (codex-cli 0.155.0), recorded on 2026-09-22. The recording keeps one
// thread, replaces the working directory with /work, and keeps one web
// search result.
const recorded = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}.jsonl`, import.meta.url), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as { method: string; params: { threadId: string } });

// The words of an event that the agent line reads: the tool name and its
// target, or the message text.
const words = (event: HarnessEvent) =>
	event.tool
		? [event.kind, event.tool.name, toolTarget(event.tool.input)?.text].filter((part) => part !== undefined).join(" ")
		: event.message
			? `${event.kind}: ${event.message.text}`
			: event.kind;

const replay = (name: string) => {
	const notifications = recorded(name);
	const parser = new CodexAppServerEvents(notifications[0]!.params.threadId);
	return notifications.flatMap((notification) => parser.parse(notification)).map(words);
};

test("a recorded Codex turn names each command, read, edit and search, and streams the first sentence", () => {
	expect(replay("turn")).toEqual([
		"working",
		"prompt",
		"message: I’ll follow the sequence, but `update_plan` is not available in this session.",
		"tool-start Read /work/README.md",
		"tool-update Read",
		"tool-end Read",
		"tool-start Shell ls",
		"tool-end Shell",
		"tool-start Edit /work/math.js",
		"tool-end Edit",
		"tool-start WebSearch",
		"tool-end WebSearch",
		"tool-start Shell for i in 1 2 3; do echo tick $i; sleep 1; done",
		"tool-update Shell",
		"tool-update Shell",
		"tool-end Shell",
		"message: Read README.md, listed files, added `subtract(a, b)` to math.js, found [Bun test documentation](https://bun.com/docs/test), and ran all three ticks.",
		"message: Read README.md, listed files, added `subtract(a, b)` to math.js, found [Bun test documentation](https://bun.com/docs/test), and ran all three ticks. Both plan updates were unavailable because this session has no `update_plan` tool.",
		"idle",
	]);
});

test("a recorded Codex turn reports stdin to a running command and a wait for a sub-agent", () => {
	expect(replay("stdinAndAgent")).toEqual([
		"working",
		"message: I’ll run the command, enter the text, then ask one sub-agent to reply.",
		"tool-start Shell read -r name; echo hello $name",
		"tool-update Shell",
		"tool-update Shell",
		"tool-update Shell",
		"tool-end Shell",
		"tool-start Agent wait",
	]);
});

const started = (item: Record<string, unknown>) => ({
	method: "item/started",
	params: { threadId: "thread", turnId: "turn", item },
});

// Items that a Trellis runtime event log recorded from Codex runs on
// 2026-09-22, with long fields cut.
test("recorded Codex MCP, image, compaction and multi-file edit items name their tool and target", () => {
	const parser = new CodexAppServerEvents("thread");
	const items = [
		{
			id: "call_AOSLiQiOqOyRsL4QJkO1ooKw",
			type: "mcpToolCall",
			server: "cua_repl",
			tool: "js",
			status: "inProgress",
			arguments: { code: "await cua.getState()", timeout_ms: 30000, title: "Inspect the active browser tabs" },
			appContext: null,
			pluginId: "unified-computer-use@openai-bundled",
			readOnlyHint: true,
			result: null,
			error: null,
			durationMs: null,
		},
		{ id: "exec-1073508b", type: "imageView", path: "/tmp/op-63-evidence/past-runs-expanded.png" },
		{ id: "01a0c714-0bc9-7373-bda9-93a0676f6c59", type: "contextCompaction" },
		{
			id: "exec-d95ac22c",
			type: "fileChange",
			changes: [
				{ path: "/work/frontend/operator/src/App.vue", kind: { type: "update", move_path: null }, diff: "@@" },
				{ path: "/work/frontend/operator/src/RouteName.ts", kind: { type: "update", move_path: null }, diff: "@@" },
			],
			status: "inProgress",
		},
	];
	expect(items.flatMap((item) => parser.parse(started(item))).map(words)).toEqual([
		"tool-start mcp__cua_repl__js",
		"tool-start ViewImage /tmp/op-63-evidence/past-runs-expanded.png",
		"tool-start Compact",
		"tool-start Edit /work/frontend/operator/src/App.vue /work/frontend/operator/src/RouteName.ts",
	]);
});

// No recorded Trellis session holds these notifications, so each one follows
// the app-server schema that `codex app-server generate-ts` writes.
test("a plan update, a patch update and MCP progress map to tool events, and output of an unknown tool maps to none", () => {
	const parser = new CodexAppServerEvents("thread");
	const ids = { threadId: "thread", turnId: "turn", itemId: "call" };
	parser.parse(started({ id: "call", type: "mcpToolCall", server: "linear", tool: "get_issue", arguments: {} }));
	expect(
		[
			{
				method: "turn/plan/updated",
				params: {
					threadId: "thread",
					turnId: "turn",
					explanation: null,
					plan: [
						{ step: "Read the ticket", status: "completed" },
						{ step: "Write the tests", status: "inProgress" },
					],
				},
			},
			{
				method: "item/fileChange/patchUpdated",
				params: { ...ids, itemId: "patch", changes: [{ path: "/work/a.ts", kind: { type: "add" }, diff: "" }] },
			},
			{ method: "item/mcpToolCall/progress", params: { ...ids, message: "Fetched the issue" } },
			{ method: "item/commandExecution/outputDelta", params: { ...ids, itemId: "unknown", delta: "late output" } },
		]
			.flatMap((notification) => parser.parse(notification))
			.map(words),
	).toEqual([
		"tool-start Plan Write the tests",
		"tool-end Plan",
		"tool-update Edit /work/a.ts",
		"tool-update mcp__linear__get_issue",
	]);
});
