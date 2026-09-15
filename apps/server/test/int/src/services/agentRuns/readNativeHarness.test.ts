import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_MANAGER_CONFIG } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { hasNativeReceipt } from "../../../../../src/services/agentRuns/nativeReceipt.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { readNativeHarness } from "../../../../../src/services/agentRuns/readNativeHarness.ts";
import type { ServiceCtx } from "../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let ticket: string;
let runId: string;
let attemptId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "OBS");
		const status = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		runId = randomUUID();
		attemptId = randomUUID();
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,ticket_id,ticket_identifier,state,terminal_id,session_id,created_at,updated_at) VALUES (${runId},'Observer','native','Builder','builder','Build',${project},'OBS',${ticket},'OBS-1','running',${attemptId},'session',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at) VALUES (${attemptId},${runId},1,'hash',now())`,
		);
	});
});
const context = () =>
	({
		...h.ctx((event) => h.flushed.push(event)),
		now: () => new Date(),
		newTx: h.read,
		home: `/tmp/checkpoint-${runId}`,
	}) as unknown as ServiceCtx;
const line = (row: Record<string, unknown>) => Buffer.from(`${JSON.stringify({ ...row, session_id: "session" })}\n`);
let log = Buffer.alloc(0);
let retainedFrom = 0;
let requested: number[] = [];
let available = true;
let processExited = false;
let exitCode: number | null = 0;
let permissionReplies: string[] = [];
const reader = {
	deliver: async (_id: string, messageId: string) => {
		permissionReplies.push(messageId);
		return { status: "delivered" };
	},
	list: async () => {
		if (!available) throw new Error("Runtime unavailable");
		return [
			{
				id: attemptId,
				mode: "stdio",
				status: processExited ? "exited" : "running",
				exitCode: processExited ? exitCode : null,
			},
		];
	},
	output: async (_id: string, offset = 0) => {
		requested.push(offset);
		const startOffset = Math.max(offset, retainedFrom);
		return {
			startOffset,
			nextOffset: log.length,
			data: log.subarray(startOffset).toString("base64"),
			truncated: offset < retainedFrom,
		};
	},
} as unknown as Pick<RuntimeClient, "list" | "output" | "deliver">;
const read = async () => readNativeHarness(context(), await h.read((tx) => getRun(tx, runId)), reader);
beforeEach(() => {
	log = Buffer.alloc(0);
	permissionReplies = [];
	retainedFrom = 0;
	requested = [];
	available = true;
	processExited = false;
	exitCode = 0;
});
test("the saved cursor survives host restart and preserves partial UTF-8", async () => {
	const bytes = line({
		type: "assistant",
		uuid: "text",
		message: { content: [{ type: "text", text: "split 𝄞 character" }] },
	});
	const split = bytes.indexOf(Buffer.from("𝄞")) + 2;
	log = bytes.subarray(0, split);
	await read();
	retainedFrom = split;
	log = Buffer.concat([bytes, line({ type: "result", uuid: "result", subtype: "success", result: "Done" })]);
	const result = await read();
	expect(result?.state).toBe("idle");
	expect(result?.transcript[0]?.text).toBe("split 𝄞 character");
	expect(requested).toEqual([0, split]);
	await read();
	expect(await h.rows(sql`SELECT * FROM activity WHERE action='agent.turn.completed'`)).toHaveLength(1);
});
test("consumed output can expire while old message receipts remain durable", async () => {
	for (let batch = 0; batch < 4; batch++) {
		const records = [];
		for (let i = 0; i < 40; i++)
			records.push(
				line({
					type: "user",
					uuid: `message-${batch * 40 + i}`,
					isReplay: true,
					message: { content: "x".repeat(10000) },
				}),
			);
		retainedFrom = log.length;
		log = Buffer.concat([log, ...records]);
		await read();
	}
	log = Buffer.concat([log, line({ type: "result", uuid: "final", subtype: "success", result: "Final output" })]);
	const result = await read();
	expect(log.length).toBeGreaterThan(1024 * 1024);
	expect(result?.state).toBe("idle");
	expect(result?.acknowledgedMessageIds).toHaveLength(128);
	expect(result?.acknowledgedMessageIds).not.toContain("message-0");
	expect(await h.read((tx) => hasNativeReceipt(tx, attemptId, "message-0"))).toBe(true);
	expect(await h.rows(sql`SELECT * FROM agent_harness_receipts`)).toHaveLength(160);
	expect(result?.transcriptTruncated).toBe(true);
	const events = h.flushed.length;
	await read();
	expect(h.flushed).toHaveLength(events);
});
test("lost unread bytes remain unknown and do not acknowledge messages", async () => {
	log = Buffer.concat([
		line({ type: "system", subtype: "init" }),
		line({ type: "user", uuid: "lost", isReplay: true, message: { content: "hi" } }),
	]);
	retainedFrom = line({ type: "system", subtype: "init" }).length;
	const result = await read();
	expect(result?.state).toBe("unknown");
	expect(await h.read((tx) => hasNativeReceipt(tx, attemptId, "lost"))).toBe(false);
});
test("temporary runtime loss preserves parser state for reconnect", async () => {
	log = line({ type: "result", uuid: "finished", subtype: "success", result: "Retained output" });
	await read();
	available = false;
	expect((await read())?.state).toBe("unknown");
	available = true;
	expect((await read())?.state).toBe("idle");
	expect(await h.rows(sql`SELECT * FROM activity WHERE action='agent.turn.completed'`)).toHaveLength(1);
});
test("a replaced attempt cannot persist receipts or output", async () => {
	const run = await h.read((tx) => getRun(tx, runId));
	await h.rows(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id=${runId}`);
	log = line({ type: "user", uuid: "stale", isReplay: true, message: { content: "hello" } });
	expect(await readNativeHarness(context(), run, reader)).toBeNull();
	expect(await h.rows(sql`SELECT * FROM agent_harness_receipts`)).toHaveLength(0);
	expect(await h.rows(sql`SELECT * FROM agent_harness_observations`)).toHaveLength(0);
});
test("concurrent readers share one read and release the completed promise", async () => {
	const run = await h.read((tx) => getRun(tx, runId));
	const ctx = context();
	log = line({ type: "system", subtype: "init" });
	await Promise.all([readNativeHarness(ctx, run, reader), readNativeHarness(ctx, run, reader)]);
	expect(requested).toEqual([0]);
	await readNativeHarness(ctx, run, reader);
	expect(requested).toEqual([0, log.length]);
});

test("the final read records process exit separately from turn state", async () => {
	log = line({ type: "result", uuid: "last", subtype: "success", result: "Complete" });
	processExited = true;
	expect((await read())?.state).toBe("idle");
	expect(
		(await h.one(sql`SELECT checkpoint FROM agent_harness_observations WHERE attempt_id=${attemptId}`)).checkpoint,
	).toMatchObject({ processExited: true });
});
test("a deliberate stop preserves a completed structured result", async () => {
	log = line({ type: "result", uuid: "completed", subtype: "success", result: "Useful output" });
	await read();
	processExited = true;
	exitCode = null;
	await h.rows(sql`UPDATE agent_runs SET state='stopped' WHERE id=${runId}`);
	expect((await read())?.state).toBe("idle");
	expect((await read())?.result).toBe("Useful output");
});

test("a running agent uses the current project permission checkbox", async () => {
	const config = { ...DEFAULT_PROJECT_MANAGER_CONFIG, trustedDirectory: true, allowAllPermissions: false };
	await h.rows(sql`UPDATE projects SET manager_config=${JSON.stringify(config)}::jsonb WHERE key='OBS'`);
	log = line({
		type: "control_request",
		request_id: "bash-request",
		request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "pwd" } },
	});
	expect((await read())?.state).toBe("needs_input");
	expect(permissionReplies).toEqual([]);
	await h.rows(
		sql`UPDATE projects SET manager_config=${JSON.stringify({ ...config, allowAllPermissions: true })}::jsonb WHERE key='OBS'`,
	);
	await read();
	expect(permissionReplies).toEqual(["permission-bash-request"]);
	await h.rows(sql`UPDATE projects SET manager_config=${JSON.stringify(config)}::jsonb WHERE key='OBS'`);
	await read();
	expect(permissionReplies).toEqual(["permission-bash-request"]);
});
