import { expect, test } from "bun:test";
import type { RuntimeHarnessActivityItem } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { readSessionObserverActivity } from "./read.ts";
import { annotated, fixture, line, outputReader } from "./testFixture.ts";

test("reads complete legacy work once across attempts and a restart", async () => {
	const f = await fixture();
	const firstAttempt = [
		line({ observedAt: "2026-09-29T12:00:00.000Z", event: { kind: "prompt", prompt: "Start." } }),
		line({
			observedAt: "2026-09-29T12:00:01.000Z",
			event: { kind: "tool-start", tool: { id: "tool-one", name: "Shell", input: { command: "work" } } },
		}),
		line({
			observedAt: "2026-09-29T12:00:02.000Z",
			event: { kind: "tool-update", tool: { id: "tool-one", name: "Shell", output: "progress" } },
		}),
		line({
			observedAt: "2026-09-29T12:00:03.000Z",
			event: { kind: "tool-end", tool: { id: "tool-one", name: "Shell" } },
		}),
		line({
			observedAt: "2026-09-29T12:00:04.000Z",
			event: { kind: "message", message: { text: "A partial update." } },
		}),
		line({
			observedAt: "2026-09-29T12:00:05.000Z",
			event: { kind: "idle", outcome: "completed", result: "The first attempt is complete." },
		}),
	];
	const secondActivity: RuntimeHarnessActivityItem = {
		id: "assistant:second",
		kind: "message",
		role: "assistant",
		text: "The resumed attempt is ready.",
		at: "2026-09-29T12:01:00.000Z",
	};
	const observerActivity: RuntimeHarnessActivityItem = {
		id: "assistant:observer",
		kind: "message",
		role: "assistant",
		text: "Observer output must stay excluded.",
		at: "2026-09-29T12:01:00.000Z",
	};
	const logs = new Map<string, Buffer>([
		[f.attempts[0]!, Buffer.concat(firstAttempt)],
		[
			f.attempts[1]!,
			line(
				annotated(
					{ kind: "message", message: { text: secondActivity.text, complete: true } },
					{ activity: secondActivity },
				),
			),
		],
		[
			f.observerAttempt,
			line(
				annotated(
					{ kind: "message", message: { text: observerActivity.text, complete: true } },
					{ activity: observerActivity },
				),
			),
		],
	]);
	const read = outputReader(logs);
	const first = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, read);
	expect(first.items.map((item) => (item.kind === "message" ? item.text : item.tool.name))).toEqual([
		"Start.",
		"Shell",
		"The first attempt is complete.",
		"The resumed attempt is ready.",
	]);
	expect(first.items.find((item) => item.kind === "tool")).toMatchObject({
		tool: { input: { command: "work" }, updates: ["progress"] },
	});
	expect(first.items.some((item) => item.kind === "message" && item.text.includes("Observer"))).toBe(false);
	expect(first.signals.map((signal) => signal.kind)).toEqual(["completion"]);
	expect(first.signals[0]).toMatchObject({ messageAvailability: "unavailable" });

	const idle = await readSessionObserverActivity({ ...f.context }, { runId: f.runId, after: first.cursor }, read);
	expect(idle).toEqual({ cursor: first.cursor, items: [], context: [], signals: [] });

	const laterActivity: RuntimeHarnessActivityItem = {
		id: "tool:later",
		kind: "tool",
		tool: { id: "later", name: "Read", output: "new work" },
		at: "2026-09-29T12:02:00.000Z",
	};
	logs.set(
		f.attempts[1]!,
		Buffer.concat([
			logs.get(f.attempts[1]!)!,
			line(annotated({ kind: "tool-end", tool: { id: "later", name: "Read" } }, { activity: laterActivity })),
		]),
	);
	const next = await readSessionObserverActivity(f.context, { runId: f.runId, after: first.cursor }, read);
	expect(next.items).toMatchObject([{ id: "tool:later", attemptGeneration: 2 }]);
});

test("replays legacy tool context across a saved cursor", async () => {
	const f = await fixture();
	const prefix = Buffer.concat([
		line({
			observedAt: "2026-09-29T12:00:00.000Z",
			event: { kind: "tool-start", tool: { id: "tool", name: "Shell", input: { command: "work" } } },
		}),
		line({
			observedAt: "2026-09-29T12:00:01.000Z",
			event: { kind: "tool-update", tool: { id: "tool", name: "Shell", output: "first" } },
		}),
	]);
	const logs = new Map<string, Buffer>([
		[f.attempts[0]!, Buffer.alloc(0)],
		[f.attempts[1]!, prefix],
	]);
	const read = outputReader(logs);
	const beforeCompletion = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, read);
	expect(beforeCompletion.items).toEqual([]);

	logs.set(
		f.attempts[1]!,
		Buffer.concat([
			prefix,
			line({
				observedAt: "2026-09-29T12:00:02.000Z",
				event: { kind: "tool-update", tool: { id: "tool", name: "Shell", output: "second" } },
			}),
			line({
				observedAt: "2026-09-29T12:00:03.000Z",
				event: { kind: "tool-end", tool: { id: "tool", name: "Shell" } },
			}),
		]),
	);
	const completed = await readSessionObserverActivity(
		f.context,
		{ runId: f.runId, after: beforeCompletion.cursor },
		read,
	);
	expect(completed.items).toMatchObject([
		{
			id: "tool:tool",
			tool: { input: { command: "work" }, updates: ["first", "second"] },
			attemptGeneration: 2,
		},
	]);

	const noRepeat = await readSessionObserverActivity(f.context, { runId: f.runId, after: completed.cursor }, read);
	expect(noRepeat.items).toEqual([]);
});

test("reports an unavailable attempt once and continues with its replacement", async () => {
	const f = await fixture();
	const logs = new Map<string, Buffer>();
	const read = outputReader(logs);
	const first = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, read);
	expect(first.signals).toMatchObject([
		{ kind: "unavailable", attemptGeneration: 1 },
		{ kind: "unavailable", attemptGeneration: 2 },
	]);

	const noRepeat = await readSessionObserverActivity(f.context, { runId: f.runId, after: first.cursor }, read);
	expect(noRepeat.signals).toEqual([]);

	const replacement = crypto.randomUUID();
	await f.db.execute(sql`INSERT INTO agent_execution_attempts
		(id, run_id, generation, token_hash, created_at) VALUES
		(${replacement}, ${f.runId}, 3, 'three', ${f.at})`);
	const item: RuntimeHarnessActivityItem = {
		id: "assistant:replacement",
		kind: "message",
		role: "assistant",
		text: "The replacement continued the work.",
		at: "2026-09-29T12:03:00.000Z",
	};
	logs.set(
		replacement,
		line(annotated({ kind: "message", message: { text: item.text, complete: true } }, { activity: item })),
	);
	const resumed = await readSessionObserverActivity(f.context, { runId: f.runId, after: first.cursor }, read);
	expect(resumed.items).toMatchObject([{ id: "assistant:replacement", attemptGeneration: 3 }]);
});

test("keeps the saved cursor when the runtime restarts during a read", async () => {
	const f = await fixture();
	await expect(
		readSessionObserverActivity(f.context, { runId: f.runId, after: null }, async () => {
			throw Object.assign(new Error("Runtime connection closed"), { code: "ECONNREFUSED" });
		}),
	).rejects.toMatchObject({ code: "ECONNREFUSED" });
});
