import { afterAll, beforeAll, expect, test } from "bun:test";
import { AgentSubagentPageSchema, AgentSubagentsInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fixture } from "../../../db/epicCancellation/fixture.ts";
import { reserveAttempt } from "../../assignments/attempts.ts";
import type { ReadEvents } from "./components/readSubagentPage/index.ts";
import { subagents } from "./subagents.ts";

let h: Awaited<ReturnType<typeof fixture>>;
const runId = ulid();
const otherProject = ulid();
let attempts: string[];
beforeAll(async () => {
	h = await fixture();
	const at = h.ctx().now;
	await h.db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${otherProject}, 'OUT', 'out', 'Other', ${at}, ${at})`);
	await h.db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, harness, created_at, updated_at)
		VALUES (${runId}, 'Parent', 'session', 'Build.', ${h.projectId}, 'CAN', ${{ preset: "claude" }}, ${at}, ${at})`);
	attempts = [];
	for (let i = 0; i < 2; i++) attempts.push((await h.run((tx) => reserveAttempt(h.ctx(), tx, { runId }))).id);
	await h.run((tx) => h.cache.rebuild(tx));
});
afterAll(async () => h.db.$client.close());
const context = () => ({ home: "unused", newTx: h.run, core: h.ctx(null) });

test("the service reads retained attempts and reports missing journals", async () => {
	const calls: string[] = [];
	const read: ReadEvents = async (id, offset) => {
		calls.push(id);
		if (id === attempts[1]) throw Object.assign(new Error("Missing"), { code: "SESSION_NOT_FOUND" });
		const line = Buffer.from(
			`${JSON.stringify({
				observedAt: "2026-10-10T10:00:00.000Z",
				event: {
					kind: "tool-end",
					tool: { id: "child", name: "Agent", input: { prompt: "Review." }, output: "Done." },
				},
			})}\n`,
		);
		return {
			data: line.subarray(offset).toString("base64"),
			startOffset: offset,
			nextOffset: line.length,
			truncated: false,
		};
	};
	const [page] = await subagents(context(), { runs: [{ id: runId }], project: "CAN" }, read);
	expect(AgentSubagentPageSchema.safeParse(page).success).toBe(true);
	expect(page!.observations).toMatchObject([{ parentRunId: runId, attemptId: attempts[0], toolCallId: "child" }]);
	expect(page!.issues).toEqual([{ attemptId: attempts[1]!, reason: "unavailable" }]);
	expect(page!.hasMore).toBe(false);
	expect(new Set(calls)).toEqual(new Set(attempts));
});

test("missing runs and other projects fail before the journal read", async () => {
	let reads = 0;
	const read: ReadEvents = async () => {
		reads++;
		throw new Error("Unexpected journal read");
	};
	await expect(subagents(context(), { runs: [{ id: runId }], project: "OUT" }, read)).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	await expect(subagents(context(), { runs: [{ id: ulid() }] }, read)).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(reads).toBe(0);
});

test("the contract rejects unbounded batches and cursors", () => {
	expect(
		AgentSubagentsInputSchema.safeParse({ runs: Array.from({ length: 21 }, () => ({ id: ulid() })) }).success,
	).toBe(false);
	expect(AgentSubagentsInputSchema.safeParse({ runs: [{ id: runId, after: "x".repeat(1025) }] }).success).toBe(false);
});
